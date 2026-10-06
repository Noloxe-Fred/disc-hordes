import type { PalierZone } from "@prisma/client";
import { BONUS_CAPTURE_APPAT, CHANCE_CAPTURE_PIEGE } from "../config/pieges";
import { prisma } from "../db";
import { stocksActuels } from "../game/stocks";

// Pieges (equilibrage.md §6 et §8), sans Discord

// Aube : chaque piege vide du groupe capture sa proie avec la chance du palier de sa zone, s'il en reste dans le
// stock naturel de la zone (une unite puisee, comme une fouille). Un appat ajoute 20 points de chance et est consomme
// a l'aube, qu'il y ait prise ou non. Appele juste apres la repousse des ressources naturelles, donc une fois par aube
// pour le groupe.
export async function capturerPieges(groupeId: number): Promise<void> {
  const pieges = await prisma.piege.findMany({ where: { priseLe: null, zone: { groupeId } }, include: { zone: true } });
  for (const piege of pieges) {
    if (piege.appate) await prisma.piege.update({ where: { id: piege.id }, data: { appate: false } });
    if (Math.random() >= chanceCapture(piege.zone.palier, piege.appate)) continue;
    const naturel = stocksActuels(piege.zone).naturel;
    if (naturel <= 0) continue;
    await prisma.$transaction([
      prisma.zone.update({ where: { id: piege.zoneId }, data: { stockNaturel: naturel - 1 } }),
      prisma.piege.update({ where: { id: piege.id }, data: { priseLe: new Date() } }),
    ]);
  }
}

export function chanceCapture(palier: PalierZone, appate: boolean): number {
  return Math.min(1, CHANCE_CAPTURE_PIEGE[palier] + (appate ? BONUS_CAPTURE_APPAT : 0));
}

// Zones ou le joueur connait un piege (le sien, ou recu avec une carte partagee)
export async function zonesPiegesConnus(joueurId: number): Promise<Set<number>> {
  const connus = await prisma.piegeConnu.findMany({ where: { joueurId }, include: { piege: true } });
  return new Set(connus.map((c) => c.piege.zoneId));
}

// Partage de carte : le destinataire apprend les pieges connus du joueur ; renvoie le nombre de nouveaux pieges
export async function partagerPieges(joueurId: number, destinataireId: number): Promise<number> {
  const connus = await prisma.piegeConnu.findMany({ where: { joueurId }, select: { piegeId: true } });
  if (connus.length === 0) return 0;
  const resultat = await prisma.piegeConnu.createMany({
    data: connus.map((c) => ({ piegeId: c.piegeId, joueurId: destinataireId })),
    skipDuplicates: true,
  });
  return resultat.count;
}
