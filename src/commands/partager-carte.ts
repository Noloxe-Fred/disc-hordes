import { StatutJoueur, StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type Guild,
} from "discord.js";
import type { Command } from "../client";
import { prisma } from "../db";
import { trouverSalonTexte } from "../discord/reconcile";
import { ajouterACarte, zonesDecouvertes } from "../services/carte";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

// Transmet sa carte de zones decouvertes a d'autres citoyens (conception.md §1 et §4) : se fait en ville, au
// retour d'une expedition, vers un ou plusieurs citoyens vivants de sa ville (ou tous). Gratuit en PA. Les
// destinataires recoivent les zones qu'ils ne connaissaient pas ; le partage est annonce sur la place publique.

const DELAI_CHOIX_MS = 120_000;
const COULEUR = 0xc8a165;

function encadre(texte: string): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(COULEUR).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte));
}

function nomJoueur(joueur: { utilisateur: { discordId: string; pseudoCache: string | null } }): string {
  return joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId;
}

// Conditions pour partager, verifiees a l'ouverture puis a nouveau au moment du partage ; null si tout va bien
function empechement(joueur: { statut: StatutJoueur; zoneActuelleId: number | null; ville: { statut: StatutVille } | null }): string | null {
  if (joueur.ville?.statut !== StatutVille.ACTIVE) return "Votre ville n'est pas encore fondée : il n'y a rien à cartographier.";
  if (joueur.statut !== StatutJoueur.VIVANT) return "Seuls les citoyens vivants en ville peuvent partager leur carte.";
  if (joueur.zoneActuelleId !== null) return "Rentrez en ville pour partager votre carte avec les autres citoyens.";
  return null;
}

async function partager(guild: Guild, joueurId: number, destinataireIds: number[]): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const raison = empechement(joueur);
  if (raison) return raison;
  const ville = joueur.ville!;

  const destinataires = await prisma.joueur.findMany({
    where: { id: { in: destinataireIds }, villeId: ville.id, statut: StatutJoueur.VIVANT, dateSortie: null },
    include: { utilisateur: true },
  });
  if (destinataires.length === 0) return "Ces citoyens ne peuvent plus recevoir votre carte.";

  const zoneIds = await zonesDecouvertes(joueurId);
  const bilans: string[] = [];
  for (const destinataire of destinataires) {
    const nouvelles = await ajouterACarte(destinataire.id, zoneIds);
    bilans.push(`• **${nomJoueur(destinataire)}** : ${nouvelles > 0 ? `${nouvelles} nouvelle(s) zone(s)` : "rien de nouveau"}`);
    await prisma.journalEntree.create({
      data: {
        villeId: ville.id,
        joueurId: destinataire.id,
        message: `Carte reçue de ${nomJoueur(joueur)}${nouvelles > 0 ? ` (+${nouvelles} zone(s))` : ""}`,
        public: false,
      },
    });
  }
  await prisma.journalEntree.create({
    data: {
      villeId: ville.id,
      joueurId,
      message: `Carte partagée avec ${destinataires.map(nomJoueur).join(", ")}`,
      public: true,
    },
  });

  const salon = await trouverSalonTexte(guild, `salon:ville:${ville.id}:place-publique`);
  await salon
    ?.send({
      content: `🗺️ <@${joueur.utilisateur.discordId}> a partagé sa carte avec ${destinataires.map((d) => `<@${d.utilisateur.discordId}>`).join(", ")}.`,
      allowedMentions: { users: destinataires.map((d) => d.utilisateur.discordId) },
    })
    .catch(() => null);

  return `## 🗺️ Carte partagée\n${bilans.join("\n")}\n\n-# Chacun peut la consulter avec \`/carte\`.`;
}

const command: Command = {
  data: new SlashCommandBuilder().setName("partager-carte").setDescription("Transmet votre carte des zones découvertes à d'autres citoyens"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);
    const joueur = await trouverJoueurActif(utilisateur.id);
    if (!joueur?.ville) {
      await interaction.reply({
        content: "Vous n'avez pas de personnage actif. Créez une ville avec `/creer-ville` ou rejoignez-en une depuis #fonder-une-colonie.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const raison = empechement(joueur);
    if (raison) {
      await interaction.reply({ content: raison, flags: MessageFlags.Ephemeral });
      return;
    }

    const nbZones = (await zonesDecouvertes(joueur.id)).length;
    if (nbZones === 0) {
      await interaction.reply({
        content: "Votre carte est vide : explorez les territoires externes avant de la partager.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 15 habitants maximum par ville : la liste tient toujours dans un menu (25 options)
    const citoyens = await prisma.joueur.findMany({
      where: { villeId: joueur.ville.id, statut: StatutJoueur.VIVANT, dateSortie: null, id: { not: joueur.id } },
      include: { utilisateur: true },
      orderBy: { id: "asc" },
      take: 25,
    });
    if (citoyens.length === 0) {
      await interaction.reply({ content: "Aucun autre citoyen vivant avec qui partager votre carte.", flags: MessageFlags.Ephemeral });
      return;
    }

    const ecran = encadre(
      `## 🗺️ Partager votre carte\nVous connaissez **${nbZones} zone(s)**. Avec qui les partager ?`,
    )
      .addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("destinataires")
            .setPlaceholder("Choisir des citoyens…")
            .setMinValues(1)
            .setMaxValues(citoyens.length)
            .addOptions(
              citoyens.map((c) => ({
                label: nomJoueur(c).slice(0, 100),
                value: String(c.id),
                description: c.zoneActuelleId === null ? "En ville" : "En territoire externe",
              })),
            ),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("toute-la-ville").setLabel("Toute la ville").setEmoji("📣").setStyle(ButtonStyle.Primary),
        ),
      );

    const reponse = await interaction.reply({ components: [ecran], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    const clic = await reponse.awaitMessageComponent({ time: DELAI_CHOIX_MS }).catch(() => null);
    if (!clic) return;

    const destinataireIds = clic.isStringSelectMenu() ? clic.values.map(Number) : citoyens.map((c) => c.id);
    await clic.deferUpdate();
    await clic.editReply({ components: [encadre(await partager(guild, joueur.id, destinataireIds))] });
  },
};

export default command;
