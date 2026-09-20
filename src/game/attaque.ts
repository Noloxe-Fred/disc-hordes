import {
  BONUS_PALISSADE_CUMULE,
  CROISSANCE_ATTAQUE_PAR_CYCLE,
  DEFENSE_BASE,
  FORCE_ATTAQUE_BASE,
  MODIFICATEUR_METEO_MAUVAIS,
} from "../config/defense";

// Force de base 15 a la nuit 1, +10% compose par cycle, +15% si mauvais temps
// (equilibrage.md §3).
export function calculerForceAttaque(cycleActuel: number, meteoMauvaise: boolean): number {
  const base = FORCE_ATTAQUE_BASE * Math.pow(1 + CROISSANCE_ATTAQUE_PAR_CYCLE, cycleActuel - 1);
  return meteoMauvaise ? base * (1 + MODIFICATEUR_METEO_MAUVAIS) : base;
}

// Defense = base + bonus palissade au palier atteint + somme des bonus de garde de la nuit
// (equilibrage.md §3). Le systeme de garde volontaire n'existe pas encore : bonusGardes
// vaut toujours 0 pour l'instant, la formule est deja prete a l'accueillir.
export function calculerDefenseTotale(palierPalissade: number, bonusGardes: number): number {
  const index = Math.max(0, Math.min(palierPalissade, BONUS_PALISSADE_CUMULE.length - 1));
  return DEFENSE_BASE + BONUS_PALISSADE_CUMULE[index] + bonusGardes;
}
