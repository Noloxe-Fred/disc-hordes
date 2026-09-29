import { PalierZone, TypePhase } from "@prisma/client";

// Rencontres de zombies et combat en territoire externe (equilibrage.md §4 et §5, « Rencontres » et « Combat »)

// Chance de rencontre apres chaque fouille et a chaque arrivee dans une zone, selon son palier ; x1,5 la nuit
export const CHANCE_RENCONTRE: Record<PalierZone, number> = {
  [PalierZone.PROCHE]: 0.15,
  [PalierZone.MOYENNE]: 0.3,
  [PalierZone.ELOIGNEE]: 0.45,
};
export const MAJORATION_RENCONTRE_NUIT = 1.5;
// Chaque fouille d'affilee sans zombie ajoute 10 points a la chance des jets suivants (remis a 0 a la rencontre et au
// retour en ville)
export const BONUS_RENCONTRE_PAR_FOUILLE = 0.1;

export const PV_ZOMBIE: Record<PalierZone, number> = {
  [PalierZone.PROCHE]: 2,
  [PalierZone.MOYENNE]: 3,
  [PalierZone.ELOIGNEE]: 4,
};

// Attaquer : cout par echange (nuit x1,5), jamais sous 1 PA avec une arme
export const COUT_ATTAQUE_JOUR = 2;
export const COUT_ATTAQUE_MIN = 1;
export const CHANCE_TOUCHER = 0.7;
export const DEGATS_JOUEUR = 1;
// Riposte du zombie encore debout : coup recu (-1 PV, 10 % d'infection)
export const CHANCE_RIPOSTE = 0.3;
export const DEGATS_ZOMBIE = 1;

// Fuir : cout (nuit x1,5) et chance de reussite ; un echec vaut un coup du zombie, sans infection
export const COUT_FUITE_JOUR = 1;
export const CHANCE_FUITE: Record<TypePhase, number> = {
  [TypePhase.JOUR]: 0.75,
  [TypePhase.NUIT]: 0.5,
};

// Rencontre laissee en suspens : -1 PV a chaque changement de phase tant qu'elle dure
export const DEGATS_RENCONTRE_PAR_PHASE = 1;

// Armes portees dans le sac : seule la meilleure compte (ordre de la liste), sans cumul
export interface Arme {
  nom: string;
  reductionPa: number;
  bonusToucher: number;
  degats: number;
}
export const ARMES: readonly Arme[] = [
  { nom: "Armes/outils avancés", reductionPa: 2, bonusToucher: 0, degats: 2 },
  { nom: "Arme avancée", reductionPa: 2, bonusToucher: 0, degats: 2 },
  { nom: "Arme simple", reductionPa: 0, bonusToucher: 0.1, degats: DEGATS_JOUEUR },
  { nom: "Arme de fortune", reductionPa: 1, bonusToucher: 0, degats: DEGATS_JOUEUR },
];
