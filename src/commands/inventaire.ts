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
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import type { Command } from "../client";
import { emojiObjet } from "../config/objets";
import { prisma } from "../db";
import { trouverSalonTexte } from "../discord/reconcile";
import { rendreInventaire } from "../discord/renduInventaire";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

// Sac du joueur (conception.md §4) : contenu, craft simple avec ce qu'on a sur soi (equilibrage.md §6) et troc
// « donner a » un autre survivant present au meme endroit. Le menu montre le sac en image (renduInventaire.ts) ;
// le menu et chaque ecran remplacent le meme message, « Retour » ramene au menu.

const DELAI_CHOIX_MS = 120_000;
const COULEUR = 0x95a5a6;
const OPTIONS_MAX = 25;
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

// Survivants a qui donner : au meme endroit que le joueur. En ville, les citoyens vivants de sa ville presents en
// ville ; dehors, tout survivant (vivant ou exclu, quelle que soit sa ville) dans la meme zone.
async function destinatairesPossibles(joueur: { id: number; villeId: number | null; zoneActuelleId: number | null }) {
  return prisma.joueur.findMany({
    where: {
      id: { not: joueur.id },
      dateSortie: null,
      ...(joueur.zoneActuelleId === null
        ? { villeId: joueur.villeId, zoneActuelleId: null, statut: StatutJoueur.VIVANT }
        : { zoneActuelleId: joueur.zoneActuelleId, statut: { in: [StatutJoueur.VIVANT, StatutJoueur.EXCLU] } }),
    },
    include: { utilisateur: true },
    orderBy: { id: "asc" },
    take: OPTIONS_MAX,
  });
}

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
  const paActuel = joueur.paActuel ?? 0;

  const sac = await contenuSac(joueurId);
  const entete = `## 🎒 Inventaire — ${interaction.user.username}` + (actif ? `\n⚡ ${paActuel} PA` : "");
  const png = rendreInventaire(`Sac — ${interaction.user.username}`, sac.map((e) => ({ ...e.objet, quantite: e.quantite })));
  const image = () => [new AttachmentBuilder(png, { name: FICHIER_SAC })];
  const menu = encadre(entete)
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
      ),
    );
  }

  const reponse = await interaction.reply({ components: [menu], files: image(), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  if (!actif) return;

  const recettes = await recettesSimples();
  const quantites = new Map(sac.map((e) => [e.objetId, e.quantite]));
  let recette: RecetteSimple | undefined;

  for (;;) {
    const clic = await reponse.awaitMessageComponent({ time: DELAI_CHOIX_MS }).catch(() => null);
    if (!clic) return;

    if (clic.customId === "retour") {
      await clic.update({ components: [menu], files: image() });
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
        await resultat.soumission.update({ components: [encadre(resultat.texte)], attachments: [] });
      }
      return;
    }
  }
}

// Fabrication confirmee : reverification (PA et ingredients ont pu changer), puis ingredients consommes, PA
// depenses et objet fabrique ajoute au sac. Pas de surcout nocturne (equilibrage.md §4 : « idem » la nuit).
async function fabriquer(joueurId: number, recette: RecetteSimple): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  if (!peutAgir(joueur)) return "Vous ne pouvez plus fabriquer.";
  const cout = recette.coutPA ?? 0;
  const paRestants = (joueur.paActuel ?? 0) - cout;
  if (paRestants < 0) return `Il vous faut **${cout} PA** pour fabriquer ${recette.objetResultat.nom}.`;
  const sac = new Map((await contenuSac(joueurId)).map((e) => [e.objetId, e.quantite]));
  const manque = manquants(recette, sac);
  if (manque.length > 0) return `Il vous manque : ${manque.join(", ")}.`;

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
  const destinataires = await destinatairesPossibles(joueur);
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
        new LabelBuilder()
          .setLabel("Quel objet ?")
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId("objet")
              .setRequired(true)
              .addOptions(
                sac.slice(0, OPTIONS_MAX).map((e) => ({ label: `${e.objet.nom} (× ${e.quantite})`.slice(0, 100), value: String(e.objetId), emoji: emojiObjet(e.objet.nom) })),
              ),
          ),
        new LabelBuilder()
          .setLabel("Combien ?")
          .setTextInputComponent(
            new TextInputBuilder().setCustomId("quantite").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4).setPlaceholder("1"),
          ),
      ),
  );
  const soumission = await clic
    .awaitModalSubmit({ time: DELAI_CHOIX_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return null;

  const destinataireId = Number(soumission.fields.getStringSelectValues("destinataire")[0]);
  const objetId = Number(soumission.fields.getStringSelectValues("objet")[0]);
  const saisie = soumission.fields.getTextInputValue("quantite").trim();
  const quantite = saisie === "" ? 1 : Number(saisie);
  const texte =
    Number.isInteger(quantite) && quantite > 0
      ? await donner(clic.guild!, joueurId, destinataireId, objetId, quantite)
      : "La quantité doit être un nombre entier positif.";
  return { soumission, texte };
}

// Don confirme : reverification (le destinataire doit toujours etre au meme endroit, l'objet toujours dans le sac),
// puis transfert, journal des deux joueurs et mention du destinataire dans le salon du lieu. Gratuit en PA.
async function donner(guild: Guild, joueurId: number, destinataireId: number, objetId: number, quantite: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  if (!peutAgir(joueur)) return "Vous ne pouvez plus donner d'objet.";
  const destinataire = (await destinatairesPossibles(joueur)).find((d) => d.id === destinataireId);
  if (!destinataire) return "Ce survivant n'est plus à côté de vous.";
  const entree = await prisma.inventaireJoueur.findUnique({
    where: { joueurId_objetId: { joueurId, objetId } },
    include: { objet: true },
  });
  if (!entree || entree.quantite < quantite) return `Vous n'avez pas ${quantite} ${entree?.objet.nom ?? "de cet objet"} sur vous.`;

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
  data: new SlashCommandBuilder().setName("inventaire").setDescription("Affiche votre sac, pour fabriquer ou donner des objets"),

  async execute(interaction) {
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
