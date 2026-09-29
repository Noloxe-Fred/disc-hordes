import { MeteoType, StatutJoueur, StatutVille, TypePhase } from "@prisma/client";
import { ButtonStyle, MessageFlags, type ButtonInteraction, type Guild } from "discord.js";
import { CYCLES_PAR_MANDAT_MAIRE } from "../../config/metiers";
import { PV_MAX } from "../../config/sante";
import { prisma } from "../../db";
import { fonderVille } from "../boutonsVille";
import { declarerChuteVille, nettoyerGroupeSiTombe } from "../chute";
import { changerPositionDiscord, retablirJoueurDiscord, retirerJoueurDeVilleDiscord } from "../joueurDiscord";
import { rafraichirMessageVille, supprimerMessagesRecrutement } from "../messageVille";
import { renommerRessource, supprimerRessources } from "../reconcile";
import { LONGUEUR_MAX_NOM_VILLE } from "../texteLibre";
import { posterDansMairie } from "../villeStructure";
import { champTexte, champVille, confirmer, journaliser, lireChoix, ouvrirFormulaire, repondre, type FamilleAdmin } from "./outils";

// Famille "Ville" du panneau /admin (conception.md §4) : effacer, renommer, forcer la fondation,
// forcer la chute, reset. Effacer, forcer la chute et reset demandent une confirmation.

async function choisirVille(interaction: ButtonInteraction, titre: string, statuts: StatutVille[], aucune: string) {
  const champ = await champVille(statuts);
  if (!champ) {
    await repondre(interaction, aucune);
    return null;
  }
  const soumission = await ouvrirFormulaire(interaction, titre, [champ]);
  if (!soumission) return null;
  const ville = await prisma.ville.findUnique({ where: { id: Number(lireChoix(soumission, "ville")) } });
  if (!ville) {
    await repondre(soumission, "Cette ville n'existe plus.");
    return null;
  }
  return { soumission, ville };
}

// --- Effacer : supprime la ville, ses personnages et ses salons/roles, quel que soit son statut ---

export async function effacerVille(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.findUniqueOrThrow({
    where: { id: villeId },
    include: { habitants: { include: { utilisateur: true } } },
  });

  if (ville.statut === StatutVille.EN_CREATION) await supprimerMessagesRecrutement(guild, villeId);

  // Joueurs encore dans la ville : position, roles de la ville et retour au role Nomade
  for (const habitant of ville.habitants.filter((h) => h.dateSortie === null && ville.statut === StatutVille.ACTIVE)) {
    await changerPositionDiscord(guild, habitant.utilisateur.discordId, habitant.zoneActuelleId, null);
    await retirerJoueurDeVilleDiscord(guild, habitant.utilisateur.discordId, villeId);
  }
  await supprimerRessources(guild, [`role:ville:${villeId}`, `categorie:ville:${villeId}`], [`salon:ville:${villeId}:`]);

  // Ordre impose par les cles etrangeres sans cascade vers Joueur (votes, gardes, signalements...)
  const joueurIds = ville.habitants.map((h) => h.id);
  await prisma.$transaction([
    prisma.ville.update({ where: { id: villeId }, data: { maireId: null } }),
    prisma.vote.deleteMany({ where: { OR: [{ votantId: { in: joueurIds } }, { election: { villeId } }] } }),
    prisma.candidature.deleteMany({ where: { OR: [{ joueurId: { in: joueurIds } }, { election: { villeId } }] } }),
    prisma.election.deleteMany({ where: { villeId } }),
    prisma.gardeVolontaire.deleteMany({ where: { OR: [{ joueurId: { in: joueurIds } }, { cycleAttaque: { villeId } }] } }),
    prisma.cycleAttaque.deleteMany({ where: { villeId } }),
    prisma.signalement.deleteMany({ where: { OR: [{ signalantId: { in: joueurIds } }, { cibleId: { in: joueurIds } }] } }),
    prisma.journalEntree.deleteMany({ where: { OR: [{ villeId }, { joueurId: { in: joueurIds } }] } }),
    prisma.contributionBatiment.deleteMany({ where: { batiment: { villeId } } }),
    prisma.joueur.deleteMany({ where: { villeId } }), // inventaires et cartes supprimes en cascade
    prisma.ville.delete({ where: { id: villeId } }), // demandes, inventaire et batiments supprimes en cascade
  ]);

  // Groupe sans ville en creation ni en jeu : salons, roles, zones et groupe supprimes
  if (ville.groupeId !== null) await nettoyerGroupeSiTombe(guild, ville.groupeId);
}

async function effacer(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirVille(
    interaction,
    "Effacer une ville",
    [StatutVille.EN_CREATION, StatutVille.ACTIVE, StatutVille.TOMBEE],
    "Aucune ville à effacer.",
  );
  if (!cible) return;
  const { soumission, ville } = cible;

  const choix = await confirmer(
    soumission,
    `⚠️ **Effacer ${ville.nom}** : la ville, ses personnages (inventaires, cartes, historique) et ses salons et rôles ` +
      "Discord seront supprimés, sans récapitulatif de chute. Les joueurs encore dedans redeviennent Nomades. Action irréversible.",
    "Effacer la ville",
  );
  if (!choix) return;

  await effacerVille(guild, ville.id);
  await journaliser(interaction.user, "Effacer une ville", `${ville.nom} (#${ville.id}, ${ville.statut})`);
  // Le panneau a pu etre ouvert depuis un salon de la ville, supprime avec elle
  await choix.editReply(`**${ville.nom}** a été effacée.`).catch(() => null);
}

// --- Renommer : base, role-ville, categorie et salon vocal (ou message de recrutement) ---

async function renommer(interaction: ButtonInteraction, guild: Guild) {
  const champ = await champVille([StatutVille.EN_CREATION, StatutVille.ACTIVE]);
  if (!champ) {
    await repondre(interaction, "Aucune ville en création ou en jeu.");
    return;
  }
  const soumission = await ouvrirFormulaire(interaction, "Renommer une ville", [
    champ,
    champTexte("nom", "Nouveau nom", { max: LONGUEUR_MAX_NOM_VILLE }),
  ]);
  if (!soumission) return;

  const nom = soumission.fields.getTextInputValue("nom").trim();
  const ville = await prisma.ville.findUnique({ where: { id: Number(lireChoix(soumission, "ville")) } });
  if (!ville || ville.statut === StatutVille.TOMBEE) {
    await repondre(soumission, "Cette ville n'est plus en création ni en jeu.");
    return;
  }
  if (!nom) {
    await repondre(soumission, "Le nom de la ville ne peut pas être vide.");
    return;
  }

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  await prisma.ville.update({ where: { id: ville.id }, data: { nom } });
  if (ville.statut === StatutVille.EN_CREATION) {
    await rafraichirMessageVille(guild, ville.id);
  } else {
    // Memes noms qu'a la fondation (villeStructure.ts)
    await renommerRessource(guild, `role:ville:${ville.id}`, `Ville:${nom}`);
    await renommerRessource(guild, `categorie:ville:${ville.id}`, nom);
    await renommerRessource(guild, `salon:ville:${ville.id}:vocal`, `Ville ${nom}`);
  }

  await journaliser(interaction.user, "Renommer une ville", `${ville.nom} → ${nom} (#${ville.id})`);
  await soumission.editReply(`**${ville.nom}** s'appelle désormais **${nom}**.`);
}

// --- Forcer la fondation : sans minimum d'habitants ---

async function forcerFondation(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirVille(interaction, "Forcer la fondation", [StatutVille.EN_CREATION], "Aucune ville en création.");
  if (!cible) return;
  const { soumission, ville } = cible;
  if (ville.statut !== StatutVille.EN_CREATION) {
    await repondre(soumission, "Cette ville n'est plus en cours de création.");
    return;
  }

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const { nombreHabitants, paMax } = await fonderVille(guild, ville.id);
  await journaliser(interaction.user, "Forcer la fondation", `${ville.nom} (#${ville.id}), ${nombreHabitants} habitant(s)`);
  await soumission.editReply(
    `**${ville.nom}** est fondée avec ${nombreHabitants} habitant(s) (PA max individuel : ${paMax}). Son créateur en est le premier maire.`,
  );
}

// --- Forcer la chute : recapitulatif dans #commemoration et depart de tous les joueurs ---

async function forcerChute(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirVille(interaction, "Forcer la chute", [StatutVille.ACTIVE], "Aucune ville en jeu.");
  if (!cible) return;
  const { soumission, ville } = cible;

  const choix = await confirmer(
    soumission,
    `⚠️ **Forcer la chute de ${ville.nom}** : fin de partie, récapitulatif posté dans #commémoration et départ de tous ` +
      "ses joueurs (retour au rôle Nomade). Si c'était la dernière ville de son groupe, les salons et rôles du groupe " +
      "sont supprimés. Action irréversible.",
    "Faire tomber la ville",
  );
  if (!choix) return;

  const actuelle = await prisma.ville.findUnique({ where: { id: ville.id } });
  if (actuelle?.statut !== StatutVille.ACTIVE) {
    await choix.editReply(`**${ville.nom}** n'est plus en jeu.`);
    return;
  }
  await posterDansMairie(guild, ville.id, `🏚️ **${ville.nom}** est tombée.`);
  await declarerChuteVille(guild, ville.id);
  await journaliser(interaction.user, "Forcer la chute", `${ville.nom} (#${ville.id}), cycle ${ville.cycleActuel}`);
  // Salons du groupe supprimes si c'etait sa derniere ville : le panneau a pu etre ouvert depuis l'un d'eux
  await choix.editReply(`**${ville.nom}** est tombée.`).catch(() => null);
}

// --- Reset : la ville repart au cycle 1 avec ses habitants actuels, tous vivants et a pleine sante ---

async function resetVille(guild: Guild, villeId: number): Promise<void> {
  const habitants = await prisma.joueur.findMany({ where: { villeId, dateSortie: null }, include: { utilisateur: true } });

  const joueurIds = habitants.map((h) => h.id);
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: villeId } });
  await prisma.$transaction([
    prisma.election.deleteMany({ where: { villeId } }), // candidatures et votes supprimes en cascade
    prisma.cycleAttaque.deleteMany({ where: { villeId } }), // gardes supprimees en cascade
    prisma.journalEntree.deleteMany({ where: { villeId } }),
    prisma.inventaireVille.deleteMany({ where: { villeId } }),
    prisma.batimentVille.deleteMany({ where: { villeId } }), // contributions supprimees en cascade
    prisma.inventaireJoueur.deleteMany({ where: { joueurId: { in: joueurIds } } }),
    prisma.carteDecouverte.deleteMany({ where: { joueurId: { in: joueurIds } } }),
    // Valeurs de depart d'un personnage (schema Joueur) ; le PA max fige a l'arrivee est conserve
    ...habitants.map((h) =>
      prisma.joueur.update({
        where: { id: h.id },
        data: {
          statut: StatutJoueur.VIVANT,
          paActuel: h.paMax,
          faim: 100,
          soif: 100,
          phasesFaimVide: 0,
          phasesSoifVide: 0,
          pv: PV_MAX,
          infecteDepuis: null,
          maisonPalier: 0,
          bonusPaReveil: 0,
          xp: 0,
          dateMort: null,
          causeMort: null,
          zoneActuelleId: null,
        },
      }),
    ),
    prisma.ville.update({
      where: { id: villeId },
      data: {
        cycleActuel: 1,
        phaseActuelle: TypePhase.JOUR,
        phaseDepuis: new Date(),
        meteoActuelle: MeteoType.NORMALE,
        rationnementActif: false,
        mandatFinCycle: ville.maireId !== null ? CYCLES_PAR_MANDAT_MAIRE : null,
      },
    }),
  ]);

  // Apres la remise a zero : les acces se recalculent sur la position (en ville) et l'inventaire (vide) remis a jour
  for (const habitant of habitants) {
    await changerPositionDiscord(guild, habitant.utilisateur.discordId, habitant.zoneActuelleId, null);
    await retablirJoueurDiscord(guild, habitant.id);
  }
}

async function reset(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirVille(interaction, "Reset d'une ville", [StatutVille.ACTIVE], "Aucune ville en jeu.");
  if (!cible) return;
  const { soumission, ville } = cible;

  const choix = await confirmer(
    soumission,
    `⚠️ **Reset de ${ville.nom}** : la ville repart au cycle 1 (jour) avec ses habitants actuels, tous vivants, à pleine ` +
      "santé, faim et soif à 100, PA au maximum, sans maison, ramenés en ville. Inventaires, cartes, bâtiments, banque, élections et " +
      "historique des attaques sont effacés ; le maire est conservé. Action irréversible.",
    "Réinitialiser la ville",
  );
  if (!choix) return;

  const actuelle = await prisma.ville.findUnique({ where: { id: ville.id } });
  if (actuelle?.statut !== StatutVille.ACTIVE) {
    await choix.editReply(`**${ville.nom}** n'est plus en jeu.`);
    return;
  }
  await resetVille(guild, ville.id);
  await posterDansMairie(guild, ville.id, `🔄 **${ville.nom}** repart de zéro : cycle 1, le jour se lève.`);
  await journaliser(interaction.user, "Reset d'une ville", `${ville.nom} (#${ville.id}), était au cycle ${ville.cycleActuel}`);
  await choix.editReply(`**${ville.nom}** a été réinitialisée (cycle 1).`);
}

export const FAMILLE_VILLE: FamilleAdmin = {
  cle: "ville",
  titre: "Ville",
  emoji: "🏘️",
  resume: "effacer, renommer, forcer la fondation ou la chute, reset",
  actions: [
    {
      cle: "effacer",
      libelle: "Effacer",
      description: "supprime une ville (quel que soit son statut), ses personnages et ses salons et rôles, sans récapitulatif.",
      style: ButtonStyle.Danger,
      executer: effacer,
    },
    {
      cle: "renommer",
      libelle: "Renommer",
      description: "change le nom d'une ville en création ou en jeu, ainsi que son rôle et ses salons.",
      executer: renommer,
    },
    {
      cle: "fonder",
      libelle: "Forcer la fondation",
      description: "fonde une ville en création sans minimum d'habitants ; son créateur devient maire.",
      style: ButtonStyle.Success,
      executer: forcerFondation,
    },
    {
      cle: "chute",
      libelle: "Forcer la chute",
      description: "fait tomber une ville en jeu (récapitulatif dans #commémoration, départ des joueurs).",
      style: ButtonStyle.Danger,
      executer: forcerChute,
    },
    {
      cle: "reset",
      libelle: "Reset",
      description: "relance une ville en jeu au cycle 1 avec ses habitants actuels, tous vivants et à pleine santé.",
      style: ButtonStyle.Danger,
      executer: reset,
    },
  ],
};
