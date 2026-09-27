import { StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../client";
import { prisma } from "../db";
import { synchroniserNomade } from "../discord/joueurDiscord";
import { supprimerMessagesRecrutement } from "../discord/messageVille";
import { estAdmin } from "../discord/permissions";
import { supprimerRessources, trouverRole } from "../discord/reconcile";
import { ROLE_CITOYEN, ROLE_MORT } from "../discord/structure";

const DELAI_CONFIRMATION_MS = 30_000;

// Ressources Discord creees en cours de partie (fondation, territoires) ; la structure fixe de /init est conservee
const PREFIXES_RESSOURCES_PARTIE = [
  "role:ville:",
  "categorie:ville:",
  "salon:ville:",
  "categorie:groupe:",
  "salon:zone:",
  "role:position:zone:",
];

// Remise a zero des parties (Admin uniquement) : villes, joueurs, demandes, groupes et territoires sont
// effaces, ainsi que leurs salons et roles. Le catalogue (objets, recettes, succes) et la structure
// posee par /init sont conserves ; les comptes et succes obtenus aussi, sauf avec l'option "comptes".
const command: Command = {
  data: new SlashCommandBuilder()
    .setName("reset-base")
    .setDescription("Efface toutes les parties en cours et leurs salons (Admin)")
    .addBooleanOption((option) =>
      option.setName("comptes").setDescription("Efface aussi les comptes joueurs et leurs succès (défaut : non)"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!(await estAdmin(guild, interaction.user.id))) {
      await interaction.reply({ content: "Commande réservée aux Admins.", flags: MessageFlags.Ephemeral });
      return;
    }

    const avecComptes = interaction.options.getBoolean("comptes") ?? false;

    const reponse = await interaction.reply({
      content:
        "⚠️ **Remise à zéro de la base** : toutes les villes (en création, en jeu, tombées), joueurs, demandes, " +
        "groupes et territoires seront effacés, ainsi que leurs salons et rôles Discord." +
        (avecComptes ? "\nLes **comptes joueurs et leurs succès** seront aussi effacés." : "") +
        "\nCette action est irréversible.",
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("confirmer").setLabel("Tout effacer").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("garder").setLabel("Annuler").setStyle(ButtonStyle.Secondary),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });

    const choix = await reponse
      .awaitMessageComponent({ componentType: ComponentType.Button, time: DELAI_CONFIRMATION_MS })
      .catch(() => null);
    if (choix?.customId !== "confirmer") {
      const abandon = { content: "Remise à zéro abandonnée.", components: [] };
      if (choix) await choix.update(abandon);
      else await interaction.editReply(abandon).catch(() => null);
      return;
    }

    // Suppression des salons/roles et des donnees : bien plus long que les 3 s accordees par Discord
    await choix.deferUpdate();
    await choix.editReply({ content: "Remise à zéro en cours...", components: [] });

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
        "Base remise à zéro : villes, joueurs, demandes, groupes et territoires effacés, salons et rôles de partie supprimés, " +
        "rôle Nomade rendu à tous." +
        (avecComptes ? " Comptes joueurs et succès effacés." : ""),
      components: [],
    });
  },
};

export default command;
