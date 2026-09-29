import { MeteoType, Metier, StatutJoueur, TypePhase } from "@prisma/client";
import type { Guild } from "discord.js";
import { BONUS_GARDE_CITOYEN, BONUS_GARDE_METIER, COUT_GARDE } from "../config/defense";
import { prisma } from "../db";
import { calculerForceAttaque } from "../game/attaque";
import { trouverSalonTexte } from "./reconcile";

// Garde volontaire (equilibrage.md §3) : la nuit, un citoyen vivant en ville se porte volontaire pour 6 PA ; a l'aube,
// il ajoute +3 a la defense (+6 pour le metier Garde), a condition d'etre toujours vivant et en ville. Les volontaires
// sont rattaches a l'attaque de la nuit (CycleAttaque), creee des le premier volontaire et completee a l'aube.

export function bonusGarde(metier: Metier | null): number {
  return metier === Metier.GARDE ? BONUS_GARDE_METIER : BONUS_GARDE_CITOYEN;
}

// Gardes de la nuit en cours comptant pour la defense : vivants et en ville au moment de l'attaque
export async function gardesDeLaNuit(villeId: number, cycleNumero: number) {
  return prisma.gardeVolontaire.findMany({
    where: {
      cycleAttaque: { villeId, cycleNumero },
      joueur: { statut: StatutJoueur.VIVANT, zoneActuelleId: null, dateSortie: null },
    },
  });
}

export async function estDeGarde(joueurId: number, villeId: number, cycleNumero: number): Promise<boolean> {
  const garde = await prisma.gardeVolontaire.findFirst({ where: { joueurId, cycleAttaque: { villeId, cycleNumero } } });
  return garde !== null;
}

// Conditions pour monter la garde ; null si tout va bien
export async function empechementGarde(joueurId: number): Promise<string | null> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const ville = joueur.ville!;
  if (joueur.statut !== StatutJoueur.VIVANT) return "Seuls les citoyens vivants peuvent monter la garde.";
  if (joueur.zoneActuelleId !== null) return "Il faut être en ville pour monter la garde.";
  if (ville.phaseActuelle !== TypePhase.NUIT) return "On ne monte la garde que la nuit.";
  if (joueur.rencontrePvZombie !== null) return "🧟 Un zombie vous occupe : réglez-le d'abord.";
  if (await estDeGarde(joueurId, ville.id, ville.cycleActuel)) return "🛡️ Vous montez déjà la garde cette nuit.";
  if ((joueur.paActuel ?? 0) < COUT_GARDE) return `Il vous faut **${COUT_GARDE} PA** pour monter la garde (vous en avez ${joueur.paActuel ?? 0}).`;
  return null;
}

export async function monterLaGarde(guild: Guild, joueurId: number): Promise<string> {
  const raison = await empechementGarde(joueurId);
  if (raison) return raison;
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const ville = joueur.ville!;
  const bonus = bonusGarde(joueur.metier);

  // Attaque de la nuit creee des le premier volontaire ; force et defense definitives ecrites a l'aube
  const attaque = await prisma.cycleAttaque.upsert({
    where: { villeId_cycleNumero: { villeId: ville.id, cycleNumero: ville.cycleActuel } },
    update: {},
    create: {
      villeId: ville.id,
      cycleNumero: ville.cycleActuel,
      forceAttaque: calculerForceAttaque(ville.cycleActuel, ville.meteoActuelle === MeteoType.MAUVAIS_TEMPS),
      defenseTotale: 0,
      meteoMauvais: ville.meteoActuelle === MeteoType.MAUVAIS_TEMPS,
    },
  });
  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: COUT_GARDE } } }),
    prisma.gardeVolontaire.create({ data: { cycleAttaqueId: attaque.id, joueurId, bonus } }),
    prisma.journalEntree.create({ data: { villeId: ville.id, joueurId, message: `Garde de nuit : +${bonus} défense` } }),
  ]);
  const salon = await trouverSalonTexte(guild, `salon:ville:${ville.id}:place-publique`);
  await salon
    ?.send({ content: `🛡️ <@${joueur.utilisateur.discordId}> monte la garde cette nuit (+${bonus} défense).`, allowedMentions: { parse: [] } })
    .catch(() => null);
  return (
    `🛡️ Vous montez la garde cette nuit (−${COUT_GARDE} PA) : **+${bonus} défense** à l'attaque de l'aube, ` +
    "si vous êtes toujours en ville à ce moment-là."
  );
}
