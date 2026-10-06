import type { PalierBatiment } from "../config/batiments";
import {
  BONUS_PALISSADE_CUMULE,
  BONUS_STRUCTURE_DEFENSE,
  BONUS_STRUCTURE_RENFORCEE,
  PART_AVANCEMENT_PAR_POINT,
  POINTS_MAX_AVANCEMENT,
  SEUIL_PERTE_PALIER_ALEATOIRE,
} from "../config/defense";

// Degats sur les chantiers en defense insuffisante (equilibrage.md §3) : le deficit devient un budget de degats,
// consomme dans l'ordre. Chaque element detruit absorbe sa valeur de defense, si bien qu'un petit deficit ne touche
// que les premieres cibles :
// 1. structures de defense : les simples d'abord, une par tranche de 3 points (entamee), puis les renforcees, une par
//    tranche de 5 points (entamee), jusqu'a ce qu'il n'en reste plus ;
// 2. palissade : -1 palier s'il reste du budget, qui absorbe le bonus de ce palier ;
// 3. avancement en cours (chantiers et maisons privees) : chaque point restant en detruit 10 %, 10 points au plus ;
// 4. s'il reste encore 5 points : -1 palier sur un batiment construit tire au hasard (hors palissade, maisons comprises).

export interface EtatDefendu {
  structures: number;
  renforcees: number;
  palierPalissade: number;
  avancementEnCours: boolean;
}

export interface PlanDegats {
  structuresDetruites: number;
  renforceesDetruites: number;
  palissadePerdue: boolean;
  partAvancement: number; // part de l'avancement en cours detruite (0 a 1)
  palierAleatoirePerdu: boolean;
}

export function planifierDegats(deficit: number, etat: EtatDefendu): PlanDegats {
  let budget = Math.max(0, deficit);

  const structuresDetruites = Math.min(etat.structures, Math.ceil(budget / BONUS_STRUCTURE_DEFENSE));
  budget -= Math.min(budget, structuresDetruites * BONUS_STRUCTURE_DEFENSE);
  const renforceesDetruites = Math.min(etat.renforcees, Math.ceil(budget / BONUS_STRUCTURE_RENFORCEE));
  budget -= Math.min(budget, renforceesDetruites * BONUS_STRUCTURE_RENFORCEE);

  const palissadePerdue = budget > 0 && etat.palierPalissade > 0;
  if (palissadePerdue) {
    const bonusPalier = BONUS_PALISSADE_CUMULE[etat.palierPalissade] - BONUS_PALISSADE_CUMULE[etat.palierPalissade - 1];
    budget -= Math.min(budget, bonusPalier);
  }

  let partAvancement = 0;
  if (budget > 0 && etat.avancementEnCours) {
    const points = Math.min(budget, POINTS_MAX_AVANCEMENT);
    partAvancement = Math.min(1, points * PART_AVANCEMENT_PAR_POINT);
    budget -= points;
  }

  return { structuresDetruites, renforceesDetruites, palissadePerdue, partAvancement, palierAleatoirePerdu: budget >= SEUIL_PERTE_PALIER_ALEATOIRE };
}

export interface Depot {
  id: number;
  nom: string;
  quantite: number;
}

// Avancement d'un chantier apres degats : une part des ressources deposees et des PA installes est perdue (arrondi en
// faveur des zombies), puis le tout est ramene sous le cout du palier vise (utile quand un palier vient d'etre perdu :
// le prochain palier redevient celui, moins cher, qu'on vient de perdre) et sous les PA que les ressources permettent.
export function avancementApresDegats(
  depots: Depot[],
  paInstalles: number,
  cible: PalierBatiment | null,
  part: number,
): { depots: Depot[]; paInstalles: number } {
  const restants = depots.map((d) => ({
    ...d,
    quantite: Math.max(0, Math.min(d.quantite - Math.ceil(d.quantite * part), cible?.ressources[d.nom] ?? 0)),
  }));
  const total = restants.reduce((somme, d) => somme + d.quantite, 0);
  const pa = Math.max(0, Math.min(paInstalles - Math.ceil(paInstalles * part), cible?.pa ?? 0, Math.floor((total * 2) / 10)));
  return { depots: restants, paInstalles: pa };
}
