import { StatutJoueur, StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import { emojiObjet, estEquipement, OBJET_RADIO, poidsObjet } from "../config/objets";
import { prisma } from "../db";
import { chargeBanque, chargeSac, deborde, libelleCharge } from "../services/charge";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { champQuantite, champsObjetsPossedes, lireObjetPossede, lireQuantite } from "./champsObjets";
import { synchroniserAccesJoueur } from "./joueurDiscord";
import { estMjActif, MESSAGE_MJ_ACTIF_NE_JOUE_PAS } from "./permissions";
import { trouverSalonTexte } from "./reconcile";
import { rendreInventaire } from "./renduInventaire";
import { enArrierePlan, verrouille } from "../services/verrou";
import { attendreFormulaire } from "./formulaires";

// Banque de ville (conception.md §1, inventaire de ville) : les citoyens vivants presents en ville y deposent des
// objets de leur sac ou en retirent, sans passer par le don. Gratuit en PA, inscrit au journal public de la ville.
// Capacite en poids selon le palier de la place publique, et celle du sac au retrait (equilibrage.md §5).
// Accessible depuis /inventaire (ecran ephemere) et depuis le panneau permanent du salon #banque de la ville, mis a jour
// apres chaque mouvement de la banque (rafraichirPanneauBanque, appele par tout ce qui y prend ou y verse des objets).

const COULEUR = 0x95a5a6;
const FICHIER_BANQUE = "banque.png";
const DELAI_FORMULAIRE_MS = 120_000;

export type SensBanque = "deposer" | "retirer";

// Boutons des operations : id(action) donne leur customId (ecran de /inventaire ou panneau du salon #banque)
function boutonsOperations(id: (action: SensBanque | "tout-deposer") => string): ButtonBuilder[] {
  return [
    new ButtonBuilder().setCustomId(id("deposer")).setLabel("Déposer").setEmoji("📥").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id("tout-deposer")).setLabel("Tout déposer").setEmoji("🎒").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id("retirer")).setLabel("Retirer").setEmoji("📤").setStyle(ButtonStyle.Secondary),
  ];
}

function listeBanque(banque: Awaited<ReturnType<typeof contenuBanque>>): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(
    banque.length > 0 ? `-# ${banque.map((e) => `${emojiObjet(e.objet.nom)} ${e.objet.nom} ×${e.quantite}`).join(" · ")}` : "-# La banque est vide.",
  );
}

function encadre(texte: string): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(COULEUR).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte));
}

// Conditions d'acces a la banque, verifiees a l'affichage puis a chaque operation ; null si tout va bien
export function empechementBanque(joueur: {
  statut: StatutJoueur;
  zoneActuelleId: number | null;
  ville: { statut: StatutVille } | null;
}): string | null {
  if (joueur.ville?.statut !== StatutVille.ACTIVE) return "Votre ville n'est pas encore fondée : elle n'a pas de banque.";
  if (joueur.statut !== StatutJoueur.VIVANT) return "Seuls les citoyens vivants ont accès à la banque de la ville.";
  if (joueur.zoneActuelleId !== null) return "Rentrez en ville pour accéder à la banque.";
  return null;
}

function contenuBanque(villeId: number) {
  return prisma.inventaireVille.findMany({
    where: { villeId, quantite: { gt: 0 } },
    include: { objet: true },
    orderBy: { objet: { nom: "asc" } },
  });
}

function contenuSac(joueurId: number) {
  return prisma.inventaireJoueur.findMany({
    where: { joueurId, quantite: { gt: 0 } },
    include: { objet: true },
    orderBy: { objet: { nom: "asc" } },
  });
}

// Ecran de la banque : son contenu en image, boutons « deposer » et « retirer », et le bouton retour fourni.
// message : resultat de la derniere operation, affiche en tete
export async function ecranBanque(
  joueurId: number,
  retour: ButtonBuilder,
  message?: string,
): Promise<{ conteneur: ContainerBuilder; fichiers: AttachmentBuilder[] }> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const raison = empechementBanque(joueur);
  if (raison) {
    return {
      conteneur: encadre(message ? `${message}\n\n${raison}` : raison).addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(retour),
      ),
      fichiers: [],
    };
  }
  const ville = joueur.ville!;
  const [banque, charge, sac] = await Promise.all([contenuBanque(ville.id), chargeBanque(ville.id), chargeSac(joueurId)]);

  const png = await rendreInventaire(`Banque — ${ville.nom}`, banque.map((e) => ({ ...e.objet, quantite: e.quantite })), { charge });
  const conteneur = encadre(
    (message ? `${message}\n\n` : "") +
      `## 🏦 Banque — ${ville.nom}\nRéserve à la disposition de tous les citoyens : 🏦 ${libelleCharge(charge)} · 🎒 votre sac ${libelleCharge(sac)}.`,
  )
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${FICHIER_BANQUE}`)))
    .addTextDisplayComponents(listeBanque(banque))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...boutonsOperations((action) => action), retour));
  return { conteneur, fichiers: [new AttachmentBuilder(png, { name: FICHIER_BANQUE })] };
}

// Panneau permanent du salon #banque : contenu en image et boutons "banque:<deposer|tout-deposer|retirer>:<villeId>"
async function construirePanneauBanque(villeId: number, nomVille: string) {
  const [banque, charge] = await Promise.all([contenuBanque(villeId), chargeBanque(villeId)]);
  const png = await rendreInventaire(`Banque — ${nomVille}`, banque.map((e) => ({ ...e.objet, quantite: e.quantite })), { charge });
  const conteneur = encadre(
    `## 🏦 Banque — ${nomVille}\nRéserve à la disposition de tous les citoyens : 🏦 ${libelleCharge(charge)}.\n` +
      "Les citoyens vivants présents en ville y déposent et en retirent librement des objets (gratuit, inscrit au journal).",
  )
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${FICHIER_BANQUE}`)))
    .addTextDisplayComponents(listeBanque(banque))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...boutonsOperations((action) => `banque:${action}:${villeId}`)));
  return { components: [conteneur], files: [new AttachmentBuilder(png, { name: FICHIER_BANQUE })] };
}

// Poste le panneau dans #banque, ou le met a jour s'il existe deja (image comprise). Lance en arriere-plan, hors de la
// file des operations : le rendu de l'image et l'envoi a Discord ne retardent pas les actions suivantes, et des
// mouvements rapproches ne donnent qu'un rafraichissement de plus (services/verrou.ts).
export async function rafraichirPanneauBanque(guild: Guild, villeId: number): Promise<void> {
  enArrierePlan(`panneau-banque:${villeId}`, () => posterPanneauBanque(guild, villeId));
}

async function posterPanneauBanque(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.findUnique({ where: { id: villeId } });
  if (!ville || ville.statut !== StatutVille.ACTIVE) return;
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:banque`);
  if (!salon) return;
  const panneau = await construirePanneauBanque(villeId, ville.nom);
  const existant = ville.messageBanqueId ? await salon.messages.fetch(ville.messageBanqueId).catch(() => null) : null;
  if (existant) {
    await existant.edit({ ...panneau, attachments: [] }).catch(() => null);
    return;
  }
  const message = await salon.send({ ...panneau, flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  if (message) await prisma.ville.update({ where: { id: villeId }, data: { messageBanqueId: message.id } });
}

// Clic sur un bouton du panneau : "banque:<deposer|tout-deposer|retirer>:<villeId>" ; resultat en reponse ephemere
export async function gererBoutonBanque(interaction: ButtonInteraction, action: string, idBrut: string): Promise<void> {
  const villeId = Number(idBrut);
  if (!interaction.guild || !Number.isInteger(villeId)) return;
  const refuser = async (content: string) => {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  };
  if (await estMjActif(interaction.guild, interaction.user.id)) return refuser(MESSAGE_MJ_ACTIF_NE_JOUE_PAS);
  const joueur = await trouverJoueurActif((await trouverOuCreerUtilisateur(interaction.user)).id);
  if (!joueur || joueur.villeId !== villeId) return refuser("Cette banque n'est pas celle de votre ville.");

  if (action === "tout-deposer") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(await toutDeposer(interaction.guild, joueur.id));
  } else if (action === "deposer" || action === "retirer") {
    const resultat = await formulaireBanque(interaction, joueur.id, action, "reponse");
    if (!resultat) return;
    if (resultat.soumission) await resultat.soumission.editReply(resultat.texte);
    else await refuser(resultat.texte);
  }
}

// Formulaire de depot ou de retrait (objet + quantite), puis operation. Renvoie null si le formulaire n'est pas
// envoye ; texte seul (sans soumission) si rien n'est possible, le clic n'ayant alors pas ouvert de formulaire.
// accuse : "update" quand le resultat remplace le message du clic (ecran ephemere de /inventaire), "reponse" quand il
// arrive dans une reponse ephemere a part (panneau public du salon #banque) ; soumission.editReply l'affiche dans les deux cas.
export async function formulaireBanque(
  clic: ButtonInteraction,
  joueurId: number,
  sens: SensBanque,
  accuse: "update" | "reponse" = "update",
): Promise<{ soumission: ModalSubmitInteraction | null; texte: string } | null> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const raison = empechementBanque(joueur);
  if (raison) return { soumission: null, texte: raison };
  const entrees = sens === "deposer" ? await contenuSac(joueurId) : await contenuBanque(joueur.villeId!);
  if (entrees.length === 0) {
    return { soumission: null, texte: sens === "deposer" ? "Votre sac est vide : rien à déposer." : "La banque est vide : rien à retirer." };
  }

  const champs = champsObjetsPossedes(entrees);
  const idFormulaire = `banque:${clic.id}`;
  await clic.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle(sens === "deposer" ? "Déposer à la banque" : "Retirer de la banque")
      .addLabelComponents(...champs, champQuantite()),
  );
  const soumission = await attendreFormulaire(clic, idFormulaire, DELAI_FORMULAIRE_MS);
  if (!soumission) return null;
  // Accuse reception tout de suite : le traitement peut depasser les 3 s laissees par Discord
  if (accuse === "reponse") await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  else if (soumission.isFromMessage()) await soumission.deferUpdate();

  const objetId = lireObjetPossede(soumission, champs.length);
  const quantite = lireQuantite(soumission);
  const texte =
    objetId === null
      ? "Choisissez un seul objet."
      : quantite === null
        ? "La quantité doit être un nombre entier positif."
        : await operer(clic.guild!, joueurId, sens, objetId, quantite);
  return { soumission, texte };
}

// Depot ou retrait : reverification (le joueur doit etre toujours en ville, l'objet toujours disponible), puis
// transfert entre le sac et la banque, et entree au journal public de la ville.
const operer = verrouille(async function operer(guild: Guild, joueurId: number, sens: SensBanque, objetId: number, quantite: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const raison = empechementBanque(joueur);
  if (raison) return raison;
  const villeId = joueur.villeId!;
  const objet = await prisma.objet.findUniqueOrThrow({ where: { id: objetId } });
  const nom = `${emojiObjet(objet.nom)} ${objet.nom}`;

  const source =
    sens === "deposer"
      ? await prisma.inventaireJoueur.findUnique({ where: { joueurId_objetId: { joueurId, objetId } } })
      : await prisma.inventaireVille.findUnique({ where: { villeId_objetId: { villeId, objetId } } });
  if (!source || source.quantite < quantite) {
    return sens === "deposer"
      ? `Vous n'avez pas ${quantite} ${nom} sur vous.`
      : `La banque n'a plus ${quantite} ${nom} (il en reste ${source?.quantite ?? 0}).`;
  }

  // La destination doit avoir la place : la banque au depot, le sac au retrait
  const poids = poidsObjet(objet.nom) * quantite;
  const destination = sens === "deposer" ? await chargeBanque(villeId) : await chargeSac(joueurId);
  if (deborde(destination, poids)) {
    return (
      (sens === "deposer" ? "La banque est trop pleine" : "Votre sac est trop lourd") +
      ` pour ${quantite} ${nom} (poids ${poids}, charge ${libelleCharge(destination)}).`
    );
  }

  const sac = { where: { joueurId_objetId: { joueurId, objetId } } };
  const banque = { where: { villeId_objetId: { villeId, objetId } } };
  await prisma.$transaction([
    sens === "deposer"
      ? prisma.inventaireJoueur.update({ ...sac, data: { quantite: { decrement: quantite } } })
      : prisma.inventaireVille.update({ ...banque, data: { quantite: { decrement: quantite } } }),
    sens === "deposer"
      ? prisma.inventaireVille.upsert({ ...banque, update: { quantite: { increment: quantite } }, create: { villeId, objetId, quantite } })
      : prisma.inventaireJoueur.upsert({ ...sac, update: { quantite: { increment: quantite } }, create: { joueurId, objetId, quantite } }),
    prisma.journalEntree.create({
      data: {
        villeId,
        joueurId,
        message: `${sens === "deposer" ? "Dépôt à la banque" : "Retrait de la banque"} : ${objet.nom} ×${quantite}`,
      },
    }),
  ]);
  if (objet.nom === OBJET_RADIO) await synchroniserAccesJoueur(guild, joueurId);
  await rafraichirPanneauBanque(guild, villeId);

  return sens === "deposer"
    ? `📥 Vous avez déposé **${nom} × ${quantite}** à la banque de la ville.`
    : `📤 Vous avez retiré **${nom} × ${quantite}** de la banque de la ville.`;
});

// « Tout déposer » : vide le sac dans la banque, objet par objet tant qu'il y a de la place (en partie pour le dernier
// qui ne tient pas en entier). Les equipements (radio) restent dans le sac : ils se deposent un par un.
export const toutDeposer = verrouille(async function toutDeposer(guild: Guild, joueurId: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const raison = empechementBanque(joueur);
  if (raison) return raison;
  const villeId = joueur.villeId!;
  const sac = await contenuSac(joueurId);
  const deposables = sac.filter((e) => !estEquipement(e.objet.nom));
  if (deposables.length === 0) {
    return sac.length === 0 ? "Votre sac est vide : rien à déposer." : "Votre sac ne contient que des équipements, qui se déposent un par un.";
  }

  const charge = await chargeBanque(villeId);
  let libre = charge.capacite - charge.utilisee;
  const verses: { entree: (typeof deposables)[number]; quantite: number }[] = [];
  for (const entree of deposables) {
    const poids = poidsObjet(entree.objet.nom);
    const quantite = poids > 0 ? Math.max(0, Math.min(entree.quantite, Math.floor(libre / poids))) : entree.quantite;
    if (quantite === 0) continue;
    libre -= quantite * poids;
    verses.push({ entree, quantite });
  }
  if (verses.length === 0) return `La banque est trop pleine pour recevoir quoi que ce soit (charge ${libelleCharge(charge)}).`;

  await prisma.$transaction([
    ...verses.flatMap(({ entree, quantite }) => [
      prisma.inventaireJoueur.update({ where: { id: entree.id }, data: { quantite: { decrement: quantite } } }),
      prisma.inventaireVille.upsert({
        where: { villeId_objetId: { villeId, objetId: entree.objetId } },
        update: { quantite: { increment: quantite } },
        create: { villeId, objetId: entree.objetId, quantite },
      }),
    ]),
    prisma.journalEntree.create({
      data: { villeId, joueurId, message: `Dépôt à la banque : ${verses.map((v) => `${v.entree.objet.nom} ×${v.quantite}`).join(", ")}` },
    }),
  ]);
  await rafraichirPanneauBanque(guild, villeId);

  const bloques = verses.length < deposables.length || verses.some((v) => v.quantite < v.entree.quantite);
  return [
    `📥 Vous avez déposé à la banque : ${verses.map((v) => `**${emojiObjet(v.entree.objet.nom)} ${v.entree.objet.nom} × ${v.quantite}**`).join(", ")}.`,
    ...(bloques ? ["🏦 La banque est pleine : le reste est resté dans votre sac."] : []),
    ...(deposables.length < sac.length ? ["Vos équipements restent dans votre sac (ils se déposent un par un)."] : []),
  ].join("\n");
});
