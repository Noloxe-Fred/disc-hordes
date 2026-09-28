import {
  FACTEUR_DEGATS_NUIT,
  FACTEUR_TOUCHE_MAISON_MIN,
  RATIO_TOUCHE_MAX,
  REDUCTION_TOUCHE_PAR_PALIER_MAISON,
} from "../config/sante";

// Attaque nocturne en defense insuffisante (equilibrage.md §3) : jet independant par citoyen present
// en ville. Ratio = min(50 %, deficit / attaque).

export function ratioDeficit(forceAttaque: number, defenseTotale: number): number {
  if (forceAttaque <= 0) return 0;
  const deficit = Math.max(0, forceAttaque - defenseTotale);
  return Math.min(RATIO_TOUCHE_MAX, deficit / forceAttaque);
}

// Chance d'etre touche, reduite de 25 % par palier de maison au-dela du premier (plancher x0,25) ; sans maison
// (palier 0) comme au palier 1, pas de reduction
export function chanceTouche(ratio: number, maisonPalier: number): number {
  const facteurMaison = Math.max(
    FACTEUR_TOUCHE_MAISON_MIN,
    1 - Math.max(0, maisonPalier - 1) * REDUCTION_TOUCHE_PAR_PALIER_MAISON,
  );
  return ratio * facteurMaison;
}

// PV perdus par un citoyen touche : ceil(ratio x 10), soit 1 a 5 PV
export function degatsNuit(ratio: number): number {
  return Math.max(1, Math.ceil(ratio * FACTEUR_DEGATS_NUIT));
}
