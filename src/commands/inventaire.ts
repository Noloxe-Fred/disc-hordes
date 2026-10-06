import { StatutJoueur, StatutVille, TypeObjet } from "@prisma/client";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import type { Command } from "../client";
import { CAPACITE_SAC, emojiObjet, estEquipement, OBJET_RADIO, poidsObjet } from "../config/objets";
import { prisma } from "../db";
import { ecranBanque, empechementBanque, formulaireBanque } from "../discord/banque";
import { champQuantite, champsObjetsPossedes, lireObjetPossede, lireQuantite } from "../discord/champsObjets";
import { ecranConfirmationAvance, ecranCraftAvance, estDansAtelier, fabriquerAvance, type RecetteAvancee } from "../discord/atelier";
import { formulaireConsommer } from "../discord/consommation";
import { synchroniserAccesJoueur } from "../discord/joueurDiscord";
import { estMjActif, MESSAGE_MJ_ACTIF_NE_JOUE_PAS } from "../discord/permissions";
import { trouverSalonTexte } from "../discord/reconcile";
import { rendreInventaire } from "../discord/renduInventaire";
import { chargeSac, deborde, libelleCharge, poidsTotal } from "../services/charge";
import { trouverJoueurActif } from "../services/joueur";
import { survivantsAuMemeEndroit } from "../services/voisins";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

// Sac du joueur (conception.md §4) : contenu, craft simple avec ce qu'on a sur soi (equilibrage.md §6) et troc
// « donner a » un autre survivant present au meme endroit, « jeter » un objet pour alleger le sac, manger et boire
// (discord/consommation.ts) et, en ville, acces a la banque (discord/banque.ts). Le sac a une capacite en poids (equilibrage.md §5, services/charge.ts).
// Le menu montre le sac en image (renduInventaire.ts) ; le menu et chaque ecran remplacent le meme message,
// « Retour » ramene au menu.

const DELAI_CHOIX_MS = 120_000;
const COULEUR = 0x95a5a6;
const FICHIER_SAC = "sac.png";

function encadre(texte: string): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(COULEUR).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte));
}

function boutonRetour(): ButtonBuilder {
  return new ButtonBuilder().setCustomId("retour").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary);
}

function ligneRetour(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour());
}

function nomJoueur(joueur: { utilisateur: { discordId: string; pseudoCache: string | null } }): string {
  return joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId;
}

// Vivant ou exclu, dans une ville en jeu : seuls ces joueurs peuvent fabriquer ou donner
function peutAgir(joueur: { statut: StatutJoueur; ville: { statut: StatutVille } | null }): boolean {
  return (
    joueur.ville?.statut === StatutVille.ACTIVE && (joueur.statut === StatutJoueur.VIVANT || joueur.statut === StatutJoueur.EXCLU)
  );
}

async function contenuSac(joueurId: number) {
  return prisma.inventaireJoueur.findMany({
    where: { joueurId, quantite: { gt: 0 } },
    include: { objet: true },
    orderBy: { objet: { nom: "asc" } },
  });
}

async function recettesSimples() {
  return prisma.recette.findMany({
    where: { objetResultat: { type: TypeObjet.CRAFT_SIMPLE } },
    include: { objetResultat: true, ingredients: { include: { objet: true } } },
    orderBy: { objetResultat: { nom: "asc" } },
  });
}
type RecetteSimple = Awaited<ReturnType<typeof recettesSimples>>[number];

// « 🪵 Bois » : nom d'objet precede de son emoji, pour les textes
function objetAvecEmoji(nom: string): string {
  return `${emojiObjet(nom)} ${nom}`;
}

function libelleIngredients(recette: RecetteSimple): string {
  return recette.ingredients.map((i) => `${i.quantite} ${objetAvecEmoji(i.objet.nom)}`).join(" + ");
}

function manquants(recette: RecetteSimple, sac: Map<number, number>): string[] {
  return recette.ingredients
    .filter((i) => (sac.get(i.objetId) ?? 0) < i.quantite)
    .map((i) => `${i.quantite - (sac.get(i.objetId) ?? 0)} ${objetAvecEmoji(i.objet.nom)}`);
}

async function afficherSac(interaction: Parameters<Command["execute"]>[0], joueurId: number) {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const actif = peutAgir(joueur);
  // Craft avance : seulement depuis le salon atelier de sa ville, une fois l'atelier construit (discord/atelier.ts)
  const atelier = interaction.guild !== null && (await estDansAtelier(interaction.guild, interaction.channelId, joueur));
  const paActuel = joueur.paActuel ?? 0;

  const entete = `## 🎒 Inventaire — ${interaction.user.username}` + (actif ? `\n⚡ ${paActuel} PA` : "");

  // Menu du sac, recharge a chaque retour : un depot ou un retrait a la banque change son contenu
  let sac = await contenuSac(joueurId);
  const construireMenu = () => {
    const charge = { utilisee: poidsTotal(sac), capacite: CAPACITE_SAC };
    // Les equipements (radio) sont montres a part, a cote des PA et de la charge, pas dans la grille du sac
    const objets = sac.map((e) => ({ ...e.objet, quantite: e.quantite }));
    const png = rendreInventaire(`Sac — ${interaction.user.username}`, objets.filter((o) => !estEquipement(o.nom)), {
      pa: actif ? paActuel : undefined,
      charge,
      equipements: objets.filter((o) => estEquipement(o.nom)),
    });
    const menu = encadre(
      `${entete}\n🎒 Charge ${libelleCharge(charge)}` + (charge.utilisee > charge.capacite ? " — **trop lourd**, déposez des objets" : ""),
    )
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${FICHIER_SAC}`)))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          sac.length > 0 ? `-# ${sac.map((e) => `${objetAvecEmoji(e.objet.nom)} ×${e.quantite}`).join(" · ")}` : "-# Votre sac est vide.",
        ),
      );
    if (actif) {
      menu.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("fabriquer").setLabel("Fabriquer").setEmoji("🔨").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("donner").setLabel("Donner").setEmoji("🤝").setStyle(ButtonStyle.Secondary),
          // Banque reservee aux citoyens vivants en ville
          ...(empechementBanque(joueur) === null
            ? [new ButtonBuilder().setCustomId("banque").setLabel("Banque").setEmoji("🏦").setStyle(ButtonStyle.Secondary)]
            : []),
          new ButtonBuilder().setCustomId("poser").setLabel("Jeter un objet").setEmoji("🗑️").setStyle(ButtonStyle.Secondary),
          ...(atelier
            ? [new ButtonBuilder().setCustomId("craft-avance").setLabel("Craft avancé").setEmoji("🛠️").setStyle(ButtonStyle.Primary)]
            : []),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("consommer-sac").setLabel("Manger / boire (sac)").setEmoji("🍲").setStyle(ButtonStyle.Success),
          // En ville, on peut aussi puiser directement dans la banque
          ...(empechementBanque(joueur) === null
            ? [new ButtonBuilder().setCustomId("consommer-banque").setLabel("Manger / boire (banque)").setEmoji("🏦").setStyle(ButtonStyle.Success)]
            : []),
        ),
      );
    }
    return { components: [menu], files: [new AttachmentBuilder(png, { name: FICHIER_SAC })] };
  };

  const reponse = await interaction.reply({ ...construireMenu(), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  if (!actif) return;

  const recettes = await recettesSimples();
  let quantites = new Map(sac.map((e) => [e.objetId, e.quantite]));
  let recette: RecetteSimple | undefined;
  let recetteAvancee: RecetteAvancee | undefined;
  let recettesAvancees: RecetteAvancee[] = [];

  for (;;) {
    const clic = await reponse.awaitMessageComponent({ time: DELAI_CHOIX_MS }).catch(() => null);
    if (!clic) return;

    if (clic.customId === "retour") {
      sac = await contenuSac(joueurId);
      quantites = new Map(sac.map((e) => [e.objetId, e.quantite]));
      await clic.update({ ...construireMenu(), attachments: [] }); // remplace l'image de la banque le cas echeant
    } else if (clic.customId === "banque") {
      const { conteneur, fichiers } = await ecranBanque(joueurId, boutonRetour());
      await clic.update({ components: [conteneur], attachments: [], files: fichiers });
    } else if (clic.isButton() && (clic.customId === "deposer" || clic.customId === "retirer")) {
      // Apres un depot ou un retrait, retour sur l'ecran de la banque rafraichi, le resultat en tete
      const resultat = await formulaireBanque(clic, joueurId, clic.customId);
      if (resultat === null) continue; // formulaire ferme ou expire : l'ecran de la banque reste en place
      const { conteneur, fichiers } = await ecranBanque(joueurId, boutonRetour(), resultat.texte);
      const ecran = { components: [conteneur], attachments: [], files: fichiers };
      if (!resultat.soumission) await clic.update(ecran);
      else if (resultat.soumission.isFromMessage()) await resultat.soumission.editReply(ecran);
    } else if (clic.customId === "craft-avance") {
      const { recettes: liste, ecran } = await ecranCraftAvance(joueurId, entete, boutonRetour());
      recettesAvancees = liste;
      await clic.update({ components: [ecran], attachments: [] });
    } else if (clic.isStringSelectMenu() && clic.customId === "recette-avancee") {
      recetteAvancee = recettesAvancees.find((r) => String(r.id) === clic.values[0]);
      if (!recetteAvancee) return;
      await clic.update({ components: [await ecranConfirmationAvance(joueurId, recetteAvancee, entete, boutonRetour())] });
    } else if (clic.customId === "confirmer-avance" && recetteAvancee) {
      await clic.deferUpdate();
      const texte = await fabriquerAvance(clic.guild!, interaction.channelId, joueurId, recetteAvancee.id);
      await clic.editReply({ components: [encadre(texte)], attachments: [] });
      return;
    } else if (clic.customId === "fabriquer") {
      await clic.update({
        components: [
          encadre(`${entete}\n**Fabriquer** : choisissez une recette.`)
            .addActionRowComponents(
              new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId("recette")
                  .setPlaceholder("Recette…")
                  .addOptions(
                    recettes.map((r) => ({
                      label: r.objetResultat.nom,
                      value: String(r.id),
                      emoji: emojiObjet(r.objetResultat.nom),
                      description: `${libelleIngredients(r)} · ${r.coutPA ?? 0} PA${manquants(r, quantites).length > 0 ? " — il manque des ingrédients" : ""}`.slice(0, 100),
                    })),
                  ),
              ),
            )
            .addActionRowComponents(ligneRetour()),
        ],
        attachments: [],
      });
    } else if (clic.isStringSelectMenu() && clic.customId === "recette") {
      recette = recettes.find((r) => String(r.id) === clic.values[0]);
      if (!recette) return;
      const cout = recette.coutPA ?? 0;
      const manque = manquants(recette, quantites);
      await clic.update({
        components: [
          manque.length > 0 || cout > paActuel
            ? encadre(
                `${entete}\n\n**${objetAvecEmoji(recette.objetResultat.nom)}** demande ${libelleIngredients(recette)} et **${cout} PA**.\n` +
                  (manque.length > 0 ? `Il vous manque : ${manque.join(", ")}.` : `Vous n'avez que ${paActuel} PA.`),
              ).addActionRowComponents(ligneRetour())
            : encadre(
                `${entete}\n\nFabriquer **${objetAvecEmoji(recette.objetResultat.nom)}** avec ${libelleIngredients(recette)} pour **${cout} PA** ?`,
              ).addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder().setCustomId("confirmer-fabrication").setLabel(`Fabriquer (${cout} PA)`).setStyle(ButtonStyle.Primary),
                  boutonRetour(),
                ),
              ),
        ],
        attachments: [],
      });
    } else if (clic.customId === "confirmer-fabrication" && recette) {
      await clic.deferUpdate();
      await clic.editReply({ components: [encadre(await fabriquer(joueurId, recette))], attachments: [] });
      return;
    } else if (clic.isButton() && clic.customId === "donner") {
      const resultat = await formulaireDon(clic, joueurId, sac);
      if (resultat === null) continue; // formulaire ferme ou expire : le menu reste en place
      if (resultat.soumission.isFromMessage()) {
        await resultat.soumission.editReply({ components: [encadre(resultat.texte)], attachments: [] });
      }
      return;
    } else if (clic.isButton() && (clic.customId === "poser" || clic.customId === "consommer-sac" || clic.customId === "consommer-banque")) {
      // Apres avoir depose ou consomme, retour sur le menu du sac rafraichi, le resultat en tete
      const resultat =
        clic.customId === "poser"
          ? await formulairePoser(clic, joueurId, sac)
          : await formulaireConsommer(clic, joueurId, clic.customId === "consommer-sac" ? "sac" : "banque");
      if (resultat === null) continue; // formulaire ferme ou expire : le menu reste en place
      sac = await contenuSac(joueurId);
      quantites = new Map(sac.map((e) => [e.objetId, e.quantite]));
      const menu = construireMenu();
      menu.components.unshift(encadre(resultat.texte));
      if (!resultat.soumission) await clic.update({ ...menu, attachments: [] });
      else if (resultat.soumission.isFromMessage()) await resultat.soumission.editReply({ ...menu, attachments: [] });
    }
  }
}

// Formulaire « jeter un objet » (objet + quantite) : l'objet quitte le sac et disparait, faute d'objets au sol pour
// l'instant. Gratuit en PA. Renvoie null si le formulaire n'est pas envoye ; texte seul (sans soumission) si le sac est
// vide, le clic n'ayant alors pas ouvert de formulaire.
async function formulairePoser(
  clic: ButtonInteraction,
  joueurId: number,
  sac: Awaited<ReturnType<typeof contenuSac>>,
): Promise<{ soumission: ModalSubmitInteraction | null; texte: string } | null> {
  if (sac.length === 0) return { soumission: null, texte: "Votre sac est vide : rien à jeter." };
  const champs = champsObjetsPossedes(sac);
  const idFormulaire = `poser:${clic.id}`;
  await clic.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle("Jeter un objet (il sera perdu)")
      .addLabelComponents(...champs, champQuantite()),
  );
  const soumission = await clic
    .awaitModalSubmit({ time: DELAI_CHOIX_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return null;
  // Accuse reception tout de suite : le traitement peut depasser les 3 s laissees par Discord
  if (soumission.isFromMessage()) await soumission.deferUpdate();

  const objetId = lireObjetPossede(soumission, champs.length);
  const quantite = lireQuantite(soumission);
  const texte =
    objetId === null
      ? "Choisissez un seul objet."
      : quantite === null
        ? "La quantité doit être un nombre entier positif."
        : await poser(clic.guild!, joueurId, objetId, quantite);
  return { soumission, texte };
}

async function poser(guild: Guild, joueurId: number, objetId: number, quantite: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  if (!peutAgir(joueur)) return "Vous ne pouvez plus jeter d'objet.";
  const entree = await prisma.inventaireJoueur.findUnique({
    where: { joueurId_objetId: { joueurId, objetId } },
    include: { objet: true },
  });
  if (!entree || entree.quantite < quantite) return `Vous n'avez pas ${quantite} ${entree?.objet.nom ?? "de cet objet"} sur vous.`;

  const objet = objetAvecEmoji(entree.objet.nom);
  await prisma.$transaction([
    prisma.inventaireJoueur.update({ where: { id: entree.id }, data: { quantite: { decrement: quantite } } }),
    prisma.journalEntree.create({
      data: { villeId: joueur.villeId!, joueurId, message: `Objet jeté : ${entree.objet.nom} ×${quantite}`, public: false },
    }),
  ]);
  if (entree.objet.nom === OBJET_RADIO) await synchroniserAccesJoueur(guild, joueurId);
  return `🗑️ Vous avez jeté **${objet} × ${quantite}**. Personne ne le retrouvera.`;
}

// Fabrication confirmee : reverification (PA et ingredients ont pu changer), puis ingredients consommes, PA
// depenses et objet fabrique ajoute au sac. Pas de surcout nocturne (equilibrage.md §4 : « idem » la nuit).
async function fabriquer(joueurId: number, recette: RecetteSimple): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  if (!peutAgir(joueur)) return "Vous ne pouvez plus fabriquer.";
  const cout = recette.coutPA ?? 0;
  const paRestants = (joueur.paActuel ?? 0) - cout;
  if (paRestants < 0) return `Il vous faut **${cout} PA** pour fabriquer ${recette.objetResultat.nom}.`;
  const contenu = await contenuSac(joueurId);
  const sac = new Map(contenu.map((e) => [e.objetId, e.quantite]));
  const manque = manquants(recette, sac);
  if (manque.length > 0) return `Il vous manque : ${manque.join(", ")}.`;
  // Poids compte apres avoir retire les ingredients : une fabrication qui allege le sac reste toujours possible
  const charge = { utilisee: poidsTotal(contenu), capacite: CAPACITE_SAC };
  const ajout = poidsObjet(recette.objetResultat.nom) - poidsTotal(recette.ingredients);
  if (deborde(charge, ajout)) {
    return `Votre sac est trop lourd pour fabriquer ${objetAvecEmoji(recette.objetResultat.nom)} (charge ${libelleCharge(charge)}) : déposez d'abord des objets.`;
  }

  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: cout } } }),
    ...recette.ingredients.map((i) =>
      prisma.inventaireJoueur.update({
        where: { joueurId_objetId: { joueurId, objetId: i.objetId } },
        data: { quantite: { decrement: i.quantite } },
      }),
    ),
    prisma.inventaireJoueur.upsert({
      where: { joueurId_objetId: { joueurId, objetId: recette.objetResultatId } },
      update: { quantite: { increment: 1 } },
      create: { joueurId, objetId: recette.objetResultatId, quantite: 1 },
    }),
    prisma.journalEntree.create({
      data: {
        villeId: joueur.villeId!,
        joueurId,
        message: `Fabrication : ${recette.objetResultat.nom}`,
        public: joueur.zoneActuelleId === null, // rien de public en territoire externe (conception.md §7)
      },
    }),
  ]);
  return `🔨 Vous avez fabriqué **${objetAvecEmoji(recette.objetResultat.nom)}** (−${cout} PA, ${paRestants} restants). Il est dans votre sac.`;
}

// Formulaire unique du don : destinataire, objet et quantite. Renvoie null si le formulaire n'est pas envoye.
async function formulaireDon(
  clic: ButtonInteraction,
  joueurId: number,
  sac: Awaited<ReturnType<typeof contenuSac>>,
) {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  const destinataires = await survivantsAuMemeEndroit(joueur);
  if (sac.length === 0 || destinataires.length === 0) {
    await clic.update({
      components: [
        encadre(
          sac.length === 0
            ? "Votre sac est vide : vous n'avez rien à donner."
            : joueur.zoneActuelleId === null
              ? "Aucun autre citoyen n'est en ville pour recevoir un objet."
              : "Aucun autre survivant n'est dans cette zone pour recevoir un objet.",
        ).addActionRowComponents(ligneRetour()),
      ],
      attachments: [],
    });
    return null;
  }

  const champsObjets = champsObjetsPossedes(sac);
  const idFormulaire = `don:${clic.id}`;
  await clic.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle("Donner un objet")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("À qui ?")
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId("destinataire")
              .setRequired(true)
              .addOptions(destinataires.map((d) => ({ label: nomJoueur(d).slice(0, 100), value: String(d.id) }))),
          ),
        ...champsObjets,
        champQuantite(),
      ),
  );
  const soumission = await clic
    .awaitModalSubmit({ time: DELAI_CHOIX_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return null;
  // Accuse reception tout de suite : le traitement peut depasser les 3 s laissees par Discord
  if (soumission.isFromMessage()) await soumission.deferUpdate();

  const destinataireId = Number(soumission.fields.getStringSelectValues("destinataire")[0]);
  const objetId = lireObjetPossede(soumission, champsObjets.length);
  const quantite = lireQuantite(soumission);
  const texte =
    objetId === null
      ? "Choisissez un seul objet."
      : quantite === null
        ? "La quantité doit être un nombre entier positif."
        : await donner(clic.guild!, joueurId, destinataireId, objetId, quantite);
  return { soumission, texte };
}

// Don confirme : reverification (le destinataire doit toujours etre au meme endroit, l'objet toujours dans le sac),
// puis transfert, journal des deux joueurs et mention du destinataire dans le salon du lieu. Gratuit en PA.
async function donner(guild: Guild, joueurId: number, destinataireId: number, objetId: number, quantite: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  if (!peutAgir(joueur)) return "Vous ne pouvez plus donner d'objet.";
  const destinataire = (await survivantsAuMemeEndroit(joueur)).find((d) => d.id === destinataireId);
  if (!destinataire) return "Ce survivant n'est plus à côté de vous.";
  const entree = await prisma.inventaireJoueur.findUnique({
    where: { joueurId_objetId: { joueurId, objetId } },
    include: { objet: true },
  });
  if (!entree || entree.quantite < quantite) return `Vous n'avez pas ${quantite} ${entree?.objet.nom ?? "de cet objet"} sur vous.`;
  const chargeDestinataire = await chargeSac(destinataireId);
  const poids = poidsObjet(entree.objet.nom) * quantite;
  if (deborde(chargeDestinataire, poids)) {
    return `Le sac de **${nomJoueur(destinataire)}** est trop lourd pour recevoir ${quantite} ${objetAvecEmoji(entree.objet.nom)} (poids ${poids}, charge ${libelleCharge(chargeDestinataire)}).`;
  }

  const enVille = joueur.zoneActuelleId === null;
  const objet = objetAvecEmoji(entree.objet.nom);
  await prisma.$transaction([
    prisma.inventaireJoueur.update({
      where: { joueurId_objetId: { joueurId, objetId } },
      data: { quantite: { decrement: quantite } },
    }),
    prisma.inventaireJoueur.upsert({
      where: { joueurId_objetId: { joueurId: destinataireId, objetId } },
      update: { quantite: { increment: quantite } },
      create: { joueurId: destinataireId, objetId, quantite },
    }),
    prisma.journalEntree.create({
      data: { villeId: joueur.villeId!, joueurId, message: `Don à ${nomJoueur(destinataire)} : ${objet} ×${quantite}`, public: enVille },
    }),
    ...(destinataire.villeId !== null
      ? [
          prisma.journalEntree.create({
            data: {
              villeId: destinataire.villeId,
              joueurId: destinataireId,
              message: `Reçu de ${nomJoueur(joueur)} : ${objet} ×${quantite}`,
              public: false,
            },
          }),
        ]
      : []),
  ]);

  if (entree.objet.nom === OBJET_RADIO) {
    await synchroniserAccesJoueur(guild, joueurId);
    await synchroniserAccesJoueur(guild, destinataireId);
  }

  const salon = await trouverSalonTexte(
    guild,
    enVille ? `salon:ville:${joueur.villeId}:place-publique` : `salon:zone:${joueur.zoneActuelleId}`,
  );
  await salon
    ?.send({
      content: `🤝 <@${joueur.utilisateur.discordId}> donne **${objet} × ${quantite}** à <@${destinataire.utilisateur.discordId}>.`,
      allowedMentions: { users: [destinataire.utilisateur.discordId] },
    })
    .catch(() => null);

  return `🤝 Vous avez donné **${objet} × ${quantite}** à **${nomJoueur(destinataire)}**.`;
}

const command: Command = {
  data: new SlashCommandBuilder().setName("inventaire").setDescription("Affiche votre sac, pour fabriquer, donner, déposer en banque, jeter, manger ou boire"),

  async execute(interaction) {
    if (interaction.guild && (await estMjActif(interaction.guild, interaction.user.id))) {
      await interaction.reply({ content: MESSAGE_MJ_ACTIF_NE_JOUE_PAS, flags: MessageFlags.Ephemeral });
      return;
    }
    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);
    const joueur = await trouverJoueurActif(utilisateur.id);

    if (!joueur) {
      await interaction.reply({
        content: "Vous n'avez pas de personnage actif. Créez une ville avec `/creer-ville` ou rejoignez-en une depuis #fonder-une-colonie.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await afficherSac(interaction, joueur.id);
  },
};

export default command;
