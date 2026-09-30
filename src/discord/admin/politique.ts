import { StatutJoueur, StatutVille } from "@prisma/client";
import { ButtonStyle, MessageFlags, type ButtonInteraction, type Guild } from "discord.js";
import { CYCLES_PAR_MANDAT_MAIRE } from "../../config/metiers";
import { prisma } from "../../db";
import { avancerElection, electionEnCours, ouvrirElection, pourvoirMairieVacante } from "../election";
import { posterDansMairie } from "../villeStructure";
import { champMembre, champVille, journaliser, lireChoix, lireJoueur, ouvrirFormulaire, repondre, type FamilleAdmin } from "./outils";

// Famille "Politique" du panneau /admin (conception.md §4-5) : forcer une election, destituer le maire, changer le maire.

// --- Forcer une election : l'ouvre, ou fait passer celle en cours a l'etape suivante sans attendre l'echeance ---

async function forcerElection(interaction: ButtonInteraction, guild: Guild) {
  const champ = await champVille([StatutVille.ACTIVE]);
  if (!champ) {
    await repondre(interaction, "Aucune ville en jeu.");
    return;
  }
  const soumission = await ouvrirFormulaire(interaction, "Forcer une élection", [champ]);
  if (!soumission) return;

  const ville = await prisma.ville.findUnique({ where: { id: Number(lireChoix(soumission, "ville")) } });
  if (ville?.statut !== StatutVille.ACTIVE) {
    await repondre(soumission, "Cette ville n'est plus en jeu.");
    return;
  }

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const election = await electionEnCours(ville.id);
  let resultat: string;
  if (election) {
    const etape = election.voteOuvert ? "vote dépouillé" : "candidatures closes";
    resultat = `**${ville.nom}** : ${etape}. ${await avancerElection(guild, election)}`;
  } else {
    await ouvrirElection(guild, ville.id, "L'administration organise une élection du maire.");
    resultat = `Élection ouverte à **${ville.nom}**.`;
  }
  await journaliser(interaction.user, "Forcer une élection", resultat);
  await soumission.editReply({ content: resultat, allowedMentions: { parse: [] } });
}

// --- Destituer le maire de force : la mairie est vacante, une election s'ouvre (sauf s'il y en a deja une) ---

async function destituer(interaction: ButtonInteraction, guild: Guild) {
  const champ = await champVille([StatutVille.ACTIVE]);
  if (!champ) {
    await repondre(interaction, "Aucune ville en jeu.");
    return;
  }
  const soumission = await ouvrirFormulaire(interaction, "Destituer le maire", [champ]);
  if (!soumission) return;

  const ville = await prisma.ville.findUnique({
    where: { id: Number(lireChoix(soumission, "ville")) },
    include: { maire: { include: { utilisateur: true } } },
  });
  if (ville?.statut !== StatutVille.ACTIVE) {
    await repondre(soumission, "Cette ville n'est plus en jeu.");
    return;
  }
  if (!ville.maire) {
    await repondre(soumission, `**${ville.nom}** n'a pas de maire.`);
    return;
  }

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  await prisma.ville.update({ where: { id: ville.id }, data: { maireId: null, mandatFinCycle: null } });
  const maire = `<@${ville.maire.utilisateur.discordId}>`;
  await posterDansMairie(guild, ville.id, `🏛️ ${maire} n'est plus maire de **${ville.nom}**.`);
  await pourvoirMairieVacante(guild, ville.id);
  await journaliser(
    interaction.user,
    "Destituer le maire",
    `${ville.maire.utilisateur.pseudoCache ?? ville.maire.utilisateur.discordId} (${ville.nom})`,
  );
  await soumission.editReply({ content: `${maire} n'est plus maire de **${ville.nom}**.`, allowedMentions: { parse: [] } });
}

// --- Changer le maire directement : nouveau mandat de 4 cycles a partir du cycle courant ---

async function changerMaire(interaction: ButtonInteraction, guild: Guild) {
  const soumission = await ouvrirFormulaire(interaction, "Changer le maire", [champMembre("Nouveau maire")]);
  if (!soumission) return;

  const joueur = await lireJoueur(soumission);
  if (!joueur?.ville) {
    await repondre(soumission, "Ce membre n'a pas de personnage dans une ville en jeu.");
    return;
  }
  if (joueur.statut !== StatutJoueur.VIVANT) {
    await repondre(soumission, `<@${joueur.utilisateur.discordId}> n'est pas un citoyen vivant de sa ville.`);
    return;
  }
  const ville = joueur.ville;
  if (ville.maireId === joueur.id) {
    await repondre(soumission, `<@${joueur.utilisateur.discordId}> est déjà maire de **${ville.nom}**.`);
    return;
  }

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  // Le mandat couvre le cycle courant et les suivants (a la fondation : cycles 1 a 4)
  const mandatFinCycle = ville.cycleActuel + CYCLES_PAR_MANDAT_MAIRE - 1;
  await prisma.ville.update({ where: { id: ville.id }, data: { maireId: joueur.id, mandatFinCycle } });
  const maire = `<@${joueur.utilisateur.discordId}>`;
  await posterDansMairie(
    guild,
    ville.id,
    `🏛️ ${maire} devient maire de **${ville.nom}** (mandat de ${CYCLES_PAR_MANDAT_MAIRE} cycles, jusqu'au cycle ${mandatFinCycle}).`,
  );
  await journaliser(
    interaction.user,
    "Changer le maire",
    `${joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId} (${ville.nom}), mandat jusqu'au cycle ${mandatFinCycle}`,
  );
  await soumission.editReply({
    content: `${maire} est maire de **${ville.nom}** jusqu'au cycle ${mandatFinCycle}.`,
    allowedMentions: { parse: [] },
  });
}

export const FAMILLE_POLITIQUE: FamilleAdmin = {
  cle: "politique",
  titre: "Politique",
  emoji: "🏛️",
  resume: "maire des villes",
  actions: [
    {
      cle: "election",
      libelle: "Forcer une élection",
      description:
        "ouvre une élection du maire dans une ville en jeu ; si une élection y est en cours, la fait passer à l'étape suivante " +
        "sans attendre (clôture des candidatures, puis dépouillement).",
      style: ButtonStyle.Primary,
      executer: forcerElection,
    },
    {
      cle: "destituer",
      libelle: "Destituer le maire",
      description: "retire son maire à une ville en jeu : une élection s'ouvre aussitôt, sauf s'il y en a déjà une.",
      style: ButtonStyle.Danger,
      executer: destituer,
    },
    {
      cle: "maire",
      libelle: "Changer le maire",
      description: `nomme maire un citoyen vivant, pour un mandat de ${CYCLES_PAR_MANDAT_MAIRE} cycles à partir du cycle courant.`,
      style: ButtonStyle.Primary,
      executer: changerMaire,
    },
  ],
};
