import { PalierZone, TypePhase } from "@prisma/client";

// Cout de jour d'un deplacement selon le palier de la zone d'arrivee (equilibrage.md §4). Le retour en ville,
// possible depuis une zone proche, coute comme l'entree dans une zone proche.
export const COUT_DEPLACEMENT_JOUR: Record<PalierZone, number> = {
  [PalierZone.PROCHE]: 2,
  [PalierZone.MOYENNE]: 3,
  [PalierZone.ELOIGNEE]: 4,
};
export const COUT_RETOUR_VILLE_JOUR = COUT_DEPLACEMENT_JOUR[PalierZone.PROCHE];

// Observer les zones adjacentes sans s'y rendre (equilibrage.md §4)
export const COUT_OBSERVATION_JOUR = 1;
// Eclaireur : observation reduite, cout de nuit fixe (et non jour x 1,5) (equilibrage.md §4)
export const COUT_OBSERVATION_ECLAIREUR: Record<TypePhase, number> = {
  [TypePhase.JOUR]: 0,
  [TypePhase.NUIT]: 1,
};

// Cout de nuit = cout de jour x 1,5, arrondi au PA superieur (equilibrage.md §4)
export const MAJORATION_NUIT = 1.5;

// Fouiller la zone courante (equilibrage.md §4)
export const COUT_FOUILLE_JOUR = 2;
