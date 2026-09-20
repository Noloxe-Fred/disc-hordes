import { StatutDemande, StatutVille } from "@prisma/client";
import { SlashCommandBuilder, type Guild } from "discord.js";
import type { Command } from "../client";
import {
  CYCLES_PAR_MANDAT_MAIRE,
  PA_CIBLE_VILLE,
  PA_MAX_PLAFOND,
  GROUPES_VILLES_MAX,
} from "../config/metiers";
import { prisma } from "../db";
import { trouverRole, trouverSalonTexte } from "../discord/reconcile";
import { ROLE_CITOYEN, SALON_FONDER_COLONIE } from "../discord/structure";
import { creerStructureVille } from "../discord/villeStructure";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

async function nettoyerMessagesRecrutement(guild: Guild, villeId: number, messageAnnonceId: string | null) {
  const salon = await trouverSalonTexte(guild, SALON_FONDER_COLONIE.cle);
  if (!salon) return;

  const idsASupprimer: string[] = [];
  if (messageAnnonceId) idsASupprimer.push(messageAnnonceId);

  const demandes = await prisma.demandeInscription.findMany({
    where: { villeId, messageId: { not: null } },
    select: { messageId: true },
  });
  for (const { messageId } of demandes) {
    if (messageId) idsASupprimer.push(messageId);
  }

  for (const id of idsASupprimer) {
    const message = await salon.messages.fetch(id).catch(() => null);
    await message?.delete().catch(() => null);
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("fonder-ville")
    .setDescription("Lance la partie pour la ville que vous avez créée"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
      return;
    }

    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);

    const ville = await prisma.ville.findFirst({
      where: { createurUtilisateurId: utilisateur.id, statut: StatutVille.EN_CREATION },
      include: { habitants: { include: { utilisateur: true } } },
    });

    if (!ville) {
      await interaction.reply({
        content: "Vous n'avez aucune ville en cours de création (ou elle est déjà fondée).",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const nombreHabitants = ville.habitants.length;
    const paMax = Math.min(PA_MAX_PLAFOND, Math.floor(PA_CIBLE_VILLE / nombreHabitants));

    const groupes = await prisma.groupe.findMany({ include: { _count: { select: { villes: true } } } });
    let groupeId = groupes.find((g) => g._count.villes < GROUPES_VILLES_MAX)?.id;
    if (!groupeId) {
      groupeId = (await prisma.groupe.create({ data: {} })).id;
    }

    const createurJoueur = ville.habitants.find((h) => h.utilisateurId === utilisateur.id);
    if (!createurJoueur) {
      await interaction.editReply("Erreur interne : le créateur n'est pas listé comme habitant de sa propre ville.");
      return;
    }

    await prisma.$transaction([
      prisma.ville.update({
        where: { id: ville.id },
        data: {
          statut: StatutVille.ACTIVE,
          dateFondation: new Date(),
          paMaxFondation: paMax,
          groupeId,
          cycleActuel: 1,
          phaseDepuis: new Date(),
          mandatFinCycle: CYCLES_PAR_MANDAT_MAIRE,
          maireId: createurJoueur.id,
        },
      }),
      prisma.joueur.updateMany({ where: { villeId: ville.id }, data: { paMax, paActuel: paMax } }),
      prisma.demandeInscription.updateMany({
        where: { villeId: ville.id, statut: StatutDemande.EN_ATTENTE },
        data: { statut: StatutDemande.REFUSEE, dateReponse: new Date() },
      }),
    ]);

    const { roleVille, salonMairie } = await creerStructureVille(guild, ville.id, ville.nom);
    const roleCitoyen = await trouverRole(guild, ROLE_CITOYEN.cle);

    for (const habitant of ville.habitants) {
      const membre = await guild.members.fetch(habitant.utilisateur.discordId).catch(() => null);
      if (!membre) continue;
      await membre.roles.add(roleVille).catch(() => null);
      if (roleCitoyen) await membre.roles.add(roleCitoyen).catch(() => null);
    }

    await nettoyerMessagesRecrutement(guild, ville.id, ville.messageAnnonceId);

    await salonMairie.send(
      `**${ville.nom}** est fondée ! ${nombreHabitants} habitant(s), PA max individuel : **${paMax}**.\n` +
        `${interaction.user} devient le premier maire (mandat de ${CYCLES_PAR_MANDAT_MAIRE} cycles).\n` +
        "Faim et soif démarrent à 100/100. Les commandes `/action` et `/aide` arrivent bientôt.",
    );

    await interaction.editReply(
      `**${ville.nom}** est fondée avec ${nombreHabitants} habitant(s) (PA max individuel : ${paMax}). Vous êtes le premier maire.`,
    );
  },
};

export default command;
