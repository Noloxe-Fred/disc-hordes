// Infection : deroulement chiffre dans equilibrage.md §1 (progression lineaire continue,
// 0% a -30% de malus PA sur 96h d'incubation). Calcule a la volee depuis Joueur.infecteDepuis
// plutot que stocke, pour ne jamais desynchroniser la valeur affichee du temps ecoule reel.

const DUREE_INCUBATION_HEURES = 96;
const MALUS_PA_MAX_POURCENT = 30;
const MS_PAR_HEURE = 3_600_000;

export interface EtatInfection {
  heuresEcoulees: number;
  malusPaPourcent: number;
  heuresRestantesAvantZombification: number;
  zombifie: boolean;
}

export function calculerEtatInfection(infecteDepuis: Date, maintenant: Date = new Date()): EtatInfection {
  const heuresEcoulees = Math.max(0, (maintenant.getTime() - infecteDepuis.getTime()) / MS_PAR_HEURE);
  const malusPaPourcent = Math.min(MALUS_PA_MAX_POURCENT, (heuresEcoulees / DUREE_INCUBATION_HEURES) * MALUS_PA_MAX_POURCENT);
  const heuresRestantesAvantZombification = Math.max(0, DUREE_INCUBATION_HEURES - heuresEcoulees);

  return {
    heuresEcoulees,
    malusPaPourcent,
    heuresRestantesAvantZombification,
    zombifie: heuresEcoulees >= DUREE_INCUBATION_HEURES,
  };
}
