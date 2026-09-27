import { StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import { prisma } from "../db";
import { initialiserServeur } from "./initialisation";
import { synchroniserNomade } from "./joueurDiscord";
import { supprimerMessagesRecrutement } from "./messageVille";
import { estAdmin } from "./permissions";
import { supprimerRessources, trouverRole } from "./reconcile";
import { ROLE_CITOYEN, ROLE_MORT } from "./structure";

// Panneau /admin (Components V2) et ses boutons : customId "admin:<action>", routes par boutons.ts.
// Les droits sont reverifies a chaque clic, le panneau pouvant rester affiche longtemps.

const COULEUR_ADMIN = 0xe67e22; // orange du role Admin
const DELAI_CONFIRMATION_MS = 30_000;

export function construirePanneauAdmin(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COULEUR_ADMIN)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🛠️ Administration\n" +
          "**Initialiser le serveur** : crée ou met à jour les rôles et salons fixes de Disc'Hordes, " +
          "et synchronise le rôle Nomade.\n" +
          "**Réinitialiser la base** : efface toutes les parties (villes, joueurs, demandes, groupes, territoires) " +
          "ainsi que leurs salons et rôles Discord ; les comptes joueurs peuvent aussi être effacés.",
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("admin:init").setLabel("Initialiser le serveur").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("admin:reset-base").setLabel("Réinitialiser la base").setStyle(ButtonStyle.Danger),
      ),
    );
}

// --- Initialiser le serveur (discord/initialisation.ts) ---

async function initialiser(interaction: ButtonInteraction, guild: Guild) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply(await initialiserServeur(guild));
}

// --- Reinitialiser la base : conserve le catalogue (objets, recettes, succes) et la structure fixe du serveur ---

// Ressources Discord creees en cours de partie (fondation, territoires)
const PREFIXES_RESSOURCES_PARTIE = [
  "role:ville:",
  "categorie:ville:",
  "salon:ville:",
  "categorie:groupe:",
  "salon:zone:",
  "role:position:zone:",
];

async function reinitialiserBase(interaction: ButtonInteraction, guild: Guild) {
  // Collecte sur le message de reponse lui-meme : sur une reponse a un bouton, discord.js collecterait
  // sinon les clics du panneau
  const reponse = await interaction.reply({
    content:
      "⚠️ **Réinitialisation de la base** : toutes les villes (en création, en jeu, tombées), joueurs, demandes, " +
      "groupes et territoires seront effacés, ainsi que leurs salons et rôles Discord.\n" +
      "« Effacer aussi les comptes » supprime en plus les comptes joueurs et leurs succès obtenus. Action irréversible.",
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("parties").setLabel("Effacer les parties").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("comptes").setLabel("Effacer aussi les comptes").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("annuler").setLabel("Annuler").setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
    withResponse: true,
  });

  const choix =
    (await reponse.resource?.message
      ?.awaitMessageComponent({ componentType: ComponentType.Button, time: DELAI_CONFIRMATION_MS })
      .catch(() => null)) ?? null;
  if (choix?.customId !== "parties" && choix?.customId !== "comptes") {
    const abandon = { content: "Réinitialisation abandonnée.", components: [] };
    if (choix) await choix.update(abandon);
    else await interaction.editReply(abandon).catch(() => null);
    return;
  }
  const avecComptes = choix.customId === "comptes";

  // Suppression des salons/roles et des donnees : bien plus long que les 3 s accordees par Discord
  await choix.deferUpdate();
  await choix.editReply({ content: "Réinitialisation en cours...", components: [] });

  // Messages de recrutement des villes en creation (ceux des villes fondees ont deja ete supprimes)
  const villesEnCreation = await prisma.ville.findMany({ where: { statut: StatutVille.EN_CREATION }, select: { id: true } });
  for (const { id } of villesEnCreation) {
    await supprimerMessagesRecrutement(guild, id);
  }

  await supprimerRessources(guild, [], PREFIXES_RESSOURCES_PARTIE);

  // Ordre impose par les cles etrangeres sans cascade (Joueur <-> Ville via le maire, Zone -> Groupe...)
  await prisma.$transaction([
    prisma.vote.deleteMany(),
    prisma.candidature.deleteMany(),
    prisma.election.deleteMany(),
    prisma.gardeVolontaire.deleteMany(),
    prisma.cycleAttaque.deleteMany(),
    prisma.signalement.deleteMany(),
    prisma.journalEntree.deleteMany(),
    prisma.contributionBatiment.deleteMany(),
    prisma.batimentVille.deleteMany(),
    prisma.inventaireVille.deleteMany(),
    prisma.demandeInscription.deleteMany(),
    prisma.ville.updateMany({ data: { maireId: null } }),
    prisma.joueur.deleteMany(), // inventaires et cartes supprimes en cascade
    prisma.ville.deleteMany(),
    prisma.zone.deleteMany(), // adjacences et stocks supprimes en cascade
    prisma.groupe.deleteMany(),
    ...(avecComptes ? [prisma.utilisateur.deleteMany()] : []), // succes obtenus supprimes en cascade
  ]);

  // Plus personne n'a de ville : roles de partie retires, role Nomade pour tous
  const roleCitoyen = await trouverRole(guild, ROLE_CITOYEN.cle);
  const roleMort = await trouverRole(guild, ROLE_MORT.cle);
  const membres = await guild.members.fetch();
  for (const membre of membres.values()) {
    if (membre.user.bot) continue;
    if (roleCitoyen && membre.roles.cache.has(roleCitoyen.id)) await membre.roles.remove(roleCitoyen).catch(() => null);
    if (roleMort && membre.roles.cache.has(roleMort.id)) await membre.roles.remove(roleMort).catch(() => null);
    await synchroniserNomade(membre);
  }

  await choix.editReply({
    content:
      "Base réinitialisée : villes, joueurs, demandes, groupes et territoires effacés, salons et rôles de partie supprimés, " +
      "rôle Nomade rendu à tous." +
      (avecComptes ? " Comptes joueurs et succès effacés." : ""),
    components: [],
  });
}

const ACTIONS = { init: initialiser, "reset-base": reinitialiserBase } as const;

export async function gererBoutonAdmin(interaction: ButtonInteraction, action: string) {
  const guild = interaction.guild;
  if (!guild || !(action in ACTIONS)) return;
  if (!(await estAdmin(guild, interaction.user.id))) {
    await interaction.reply({ content: "Action réservée aux Admins.", flags: MessageFlags.Ephemeral });
    return;
  }
  await ACTIONS[action as keyof typeof ACTIONS](interaction, guild);
}
