import { StatutDemande, StatutVille } from "@prisma/client";
import { SlashCommandBuilder, type Guild } from "discord.js";
import type { Command } from "../client";
import {
  CYCLES_PAR_MANDAT_MAIRE,
  PA_CIBLE_VILLE,
  PA_MAX_PLAFOND,
  GROUPES_VILLES_MAX,
  JOUEURS_MIN_FONDATION,
} from "../config/metiers";
import { prisma } from "../db";
import { trouverRole, trouverSalonTexte } from "../discord/reconcile";
import { ROLE_ADMIN, ROLE_CITOYEN, ROLE_MJ, SALON_FONDER_COLONIE, SALON_NOUVEL_ARRIVANT } from "../discord/structure";
import { creerStructureVille } from "../discord/villeStructure";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

async function estMjOuAdmin(guild: Guild, userId: string): Promise<boolean> {
  const membre = await guild.members.fetch(userId).catch(() => null);
  if (!membre) return false;
  for (const cle of [ROLE_MJ.cle, ROLE_ADMIN.cle]) {
    const role = await trouverRole(guild, cle);
    if (role && membre.roles.cache.has(role.id)) return true;
  }
  return false;
}

async function supprimerMessages(guild: Guild, cleSalon: string, ids: string[]) {
  const salon = await trouverSalonTexte(guild, cleSalon);
  if (!salon) return;
  for (const id of ids) {
    const message = await salon.messages.fetch(id).catch(() => null);
    await message?.delete().catch(() => null);
  }
}

// Annonce de la ville dans #fonder-une-colonie, demandes d'inscription dans #nouvel-arrivant
async function nettoyerMessagesRecrutement(guild: Guild, villeId: number, messageAnnonceId: string | null) {
  if (messageAnnonceId) await supprimerMessages(guild, SALON_FONDER_COLONIE.cle, [messageAnnonceId]);

  const demandes = await prisma.demandeInscription.findMany({
    where: { villeId, messageId: { not: null } },
    select: { messageId: true },
  });
  const idsDemandes = demandes.flatMap(({ messageId }) => (messageId ? [messageId] : []));
  await supprimerMessages(guild, SALON_NOUVEL_ARRIVANT.cle, idsDemandes);
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

    const nombreHabitants = ville.habitants.length;

    if (nombreHabitants < JOUEURS_MIN_FONDATION && !(await estMjOuAdmin(guild, interaction.user.id))) {
      await interaction.reply({
        content:
          `**${ville.nom}** compte ${nombreHabitants} habitant(s) : il en faut au moins ${JOUEURS_MIN_FONDATION} pour la fonder. ` +
          "Acceptez d'autres demandes d'inscription avant de relancer `/fonder-ville`.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

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
