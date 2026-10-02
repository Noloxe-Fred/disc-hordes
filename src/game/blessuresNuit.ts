import {
  CHANCE_DEFENSE_MAISON_MAX,
  DEFENSE_MAISON_PAR_PALIER,
  FACTEUR_DEGATS_NUIT,
  RATIO_DEGATS_MAX,
} from "../config/sante";

// Attaque nocturne en defense insuffisante (equilibrage.md §3) : le nombre de citoyens presents en ville
// frappes est proportionnel au ratio deficit / attaque, les victimes sont tirees au hasard.

export function ratioDeficit(forceAttaque: number, defenseTotale: number): number {
  if (forceAttaque <= 0) return 0;
  const deficit = Math.max(0, forceAttaque - defenseTotale);
  return Math.min(1, deficit / forceAttaque);
}

// Nombre de victimes = ratio x presents ; la partie decimale est une chance d'une victime de plus
// (ratio 72 % sur 4 presents : 2,9 → 2 victimes, 90 % de chance d'une troisieme)
export function nombreVictimes(ratio: number, presents: number, tirage: number = Math.random()): number {
  const attendu = ratio * presents;
  const entier = Math.floor(attendu);
  return Math.min(presents, entier + (tirage < attendu - entier ? 1 : 0));
}

// Tire "nombre" elements au hasard (melange de Fisher-Yates partiel)
export function tirerAuHasard<T>(liste: readonly T[], nombre: number): T[] {
  const copie = [...liste];
  const n = Math.min(nombre, copie.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copie.length - i));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie.slice(0, n);
}

// Chance qu'une victime tiree au sort repousse les zombies depuis sa maison privee : 25 % par palier au-dela
// du premier (plafond 75 %) ; sans maison ou au palier 1, aucune
export function chanceDefenseMaison(maisonPalier: number): number {
  return Math.min(CHANCE_DEFENSE_MAISON_MAX, Math.max(0, maisonPalier - 1) * DEFENSE_MAISON_PAR_PALIER);
}

// PV perdus par une victime : ceil(min(50 %, ratio) x 10), soit 1 a 5 PV
export function degatsNuit(ratio: number): number {
  return Math.max(1, Math.ceil(Math.min(RATIO_DEGATS_MAX, ratio) * FACTEUR_DEGATS_NUIT));
}
