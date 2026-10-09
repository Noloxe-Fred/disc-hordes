import {
  BONUS_PALISSADE_CUMULE,
  bonusStructures,
  CROISSANCE_ATTAQUE_PAR_CYCLE,
  DEFENSE_BASE,
  FORCE_ATTAQUE_BASE,
  MODIFICATEUR_METEO_MAUVAIS,
} from "../config/defense";

// Force de base 10 a la nuit 1, +13% compose par cycle, +15% si mauvais temps
// (equilibrage.md §3).
export function calculerForceAttaque(cycleActuel: number, meteoMauvaise: boolean): number {
  const base = FORCE_ATTAQUE_BASE * Math.pow(1 + CROISSANCE_ATTAQUE_PAR_CYCLE, cycleActuel - 1);
  return meteoMauvaise ? base * (1 + MODIFICATEUR_METEO_MAUVAIS) : base;
}

// Defense = base + bonus palissade au palier atteint + somme des bonus de garde de la nuit
// (equilibrage.md §3), les gardes etant ceux encore vivants et en ville a l'aube (discord/garde.ts), + 3 par structure
// de defense avancee posee et + 5 par structure renforcee (equilibrage.md §8).
export function calculerDefenseTotale(palierPalissade: number, bonusGardes: number, structures = 0, renforcees = 0): number {
  const index = Math.max(0, Math.min(palierPalissade, BONUS_PALISSADE_CUMULE.length - 1));
  return DEFENSE_BASE + BONUS_PALISSADE_CUMULE[index] + bonusGardes + bonusStructures(structures, renforcees);
}
