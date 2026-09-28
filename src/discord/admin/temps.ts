import { StatutVille, TypePhase } from "@prisma/client";
import { ButtonStyle, MessageFlags, type ButtonInteraction, type Guild, type LabelBuilder } from "discord.js";
import { prisma } from "../../db";
import { basculerPhase, resoudreAttaque } from "../../scheduler/cycle";
import { posterDansMairie } from "../villeStructure";
import { champTexte, champVille, journaliser, lireChoix, lireEntier, ouvrirFormulaire, repondre, type FamilleAdmin } from "./outils";

// Famille "Temps" du panneau /admin (conception.md §4) : forcer le passage jour/nuit, declencher une attaque
// de zombies, avancer ou reculer le cycle. L'horloge commune de minuit continue de tourner normalement.

const CYCLES_MAX_PAR_AJUSTEMENT = 50;

function libellePhase(phase: TypePhase): string {
  return phase === TypePhase.JOUR ? "jour" : "nuit";
}

async function villeEnJeu(interaction: ButtonInteraction, titre: string, champsSupplementaires: LabelBuilder[] = []) {
  const champ = await champVille([StatutVille.ACTIVE]);
  if (!champ) {
    await repondre(interaction, "Aucune ville en jeu.");
    return null;
  }
  const soumission = await ouvrirFormulaire(interaction, titre, [champ, ...champsSupplementaires]);
  if (!soumission) return null;
  const ville = await prisma.ville.findUnique({ where: { id: Number(lireChoix(soumission, "ville")) } });
  if (ville?.statut !== StatutVille.ACTIVE) {
    await repondre(soumission, "Cette ville n'est plus en jeu.");
    return null;
  }
  return { soumission, ville };
}

// --- Forcer le passage jour/nuit : meme traitement qu'a minuit (attaque a l'aube, faim/soif) ---

async function forcerPhase(interaction: ButtonInteraction, guild: Guild) {
  const cible = await villeEnJeu(interaction, "Forcer le passage jour/nuit");
  if (!cible) return;
  const { soumission, ville } = cible;

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  await basculerPhase(guild, ville);

  const apres = await prisma.ville.findUniqueOrThrow({ where: { id: ville.id } });
  const resultat =
    apres.statut === StatutVille.TOMBEE
      ? "la ville est tombée"
      : `${libellePhase(apres.phaseActuelle)}, cycle ${apres.cycleActuel}`;
  await journaliser(
    interaction.user,
    "Forcer le passage jour/nuit",
    `${ville.nom} (#${ville.id}) : ${libellePhase(ville.phaseActuelle)} cycle ${ville.cycleActuel} → ${resultat}`,
  );
  await soumission.editReply(`**${ville.nom}** : ${libellePhase(ville.phaseActuelle)} → ${resultat}. Compte rendu posté dans la mairie.`);
}

// --- Declencher une attaque : a la force du cycle courant, sans changer de phase ni de cycle ---

async function declencherAttaque(interaction: ButtonInteraction, guild: Guild) {
  const cible = await villeEnJeu(interaction, "Déclencher une attaque");
  if (!cible) return;
  const { soumission, ville } = cible;

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  // Hors historique : l'attaque de l'aube de ce cycle reste celle qui compte dans les statistiques
  const { compteRendu, villeTombee } = await resoudreAttaque(guild, ville, false);
  await posterDansMairie(guild, ville.id, villeTombee ? `${compteRendu}\n\n**${ville.nom}** est tombée.` : compteRendu);

  await journaliser(interaction.user, "Déclencher une attaque", `${ville.nom} (#${ville.id}), cycle ${ville.cycleActuel}`);
  await soumission.editReply({ content: `Attaque déclenchée sur **${ville.nom}** :\n${compteRendu}`, allowedMentions: { parse: [] } });
}

// --- Avancer / reculer le cycle : change la force des prochaines attaques, pas la phase ---

function decalerCycle(sens: 1 | -1) {
  return async (interaction: ButtonInteraction) => {
    const cible = await villeEnJeu(interaction, sens > 0 ? "Avancer le cycle" : "Reculer le cycle", [
      champTexte("nombre", "Nombre de cycles", { requis: false, max: 2, exemple: "1" }),
    ]);
    if (!cible) return;
    const { soumission, ville } = cible;

    const saisie = soumission.fields.getTextInputValue("nombre").trim() || "1";
    const nombre = lireEntier(saisie, 1, CYCLES_MAX_PAR_AJUSTEMENT);
    if (nombre === null) {
      await repondre(soumission, `Le nombre de cycles doit être un entier entre 1 et ${CYCLES_MAX_PAR_AJUSTEMENT}.`);
      return;
    }

    const cycle = Math.max(1, ville.cycleActuel + sens * nombre);
    await prisma.ville.update({ where: { id: ville.id }, data: { cycleActuel: cycle } });
    await journaliser(
      interaction.user,
      sens > 0 ? "Avancer le cycle" : "Reculer le cycle",
      `${ville.nom} (#${ville.id}) : cycle ${ville.cycleActuel} → ${cycle}`,
    );
    await repondre(soumission, `**${ville.nom}** : cycle ${ville.cycleActuel} → **${cycle}** (${libellePhase(ville.phaseActuelle)}).`);
  };
}

export const FAMILLE_TEMPS: FamilleAdmin = {
  cle: "temps",
  titre: "Temps",
  emoji: "⏳",
  resume: "phases jour/nuit, attaques de zombies et cycles",
  actions: [
    {
      cle: "phase",
      libelle: "Forcer passage jour/nuit",
      description: "bascule une ville à la phase suivante, comme à minuit (attaque à l'aube, faim et soif).",
      style: ButtonStyle.Primary,
      executer: forcerPhase,
    },
    {
      cle: "attaque",
      libelle: "Déclencher attaque",
      description: "lance une attaque de zombies à la force du cycle courant, sans changer de phase.",
      style: ButtonStyle.Danger,
      executer: declencherAttaque,
    },
    { cle: "avancer", libelle: "Avancer le cycle", description: "augmente le numéro de cycle (force des attaques).", executer: decalerCycle(1) },
    { cle: "reculer", libelle: "Reculer le cycle", description: "diminue le numéro de cycle, au minimum 1.", executer: decalerCycle(-1) },
  ],
};
