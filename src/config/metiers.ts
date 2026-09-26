import { Metier } from "@prisma/client";

// Places par metier, fixes independamment de la taille de la ville (equilibrage.md §3,
// "sur 15 joueurs max par ville"). "Sans metier" (2 places) n'est pas une valeur de l'enum
// Metier : un Joueur.metier a null represente ce cas.
export const PLACES_PAR_METIER: Record<Metier, number> = {
  [Metier.GARDE]: 2,
  [Metier.MEDECIN]: 1,
  [Metier.ARTISAN]: 2,
  [Metier.ECLAIREUR]: 2,
  [Metier.GUETTEUR]: 1,
  [Metier.CUISINIER]: 1,
  [Metier.FOSSOYEUR]: 1,
  [Metier.INGENIEUR]: 1,
  [Metier.CHASSEUR]: 1,
  [Metier.DIPLOMATE]: 1,
};

export const PLACES_SANS_METIER = 2;

export const NOM_METIER: Record<Metier, string> = {
  [Metier.GARDE]: "Garde",
  [Metier.MEDECIN]: "Médecin",
  [Metier.ARTISAN]: "Artisan",
  [Metier.ECLAIREUR]: "Éclaireur",
  [Metier.GUETTEUR]: "Guetteur",
  [Metier.CUISINIER]: "Cuisinier",
  [Metier.FOSSOYEUR]: "Fossoyeur",
  [Metier.INGENIEUR]: "Ingénieur/bâtisseur",
  [Metier.CHASSEUR]: "Chasseur/trappeur",
  [Metier.DIPLOMATE]: "Diplomate/marchand",
};

export const JOUEURS_MAX_PAR_VILLE = 15;
// Minimum d'habitants pour /fonder-ville ; un membre ayant le role MJ ou Admin peut fonder en dessous (equilibrage.md §1)
export const JOUEURS_MIN_FONDATION = 3;
export const PA_CIBLE_VILLE = 180;
export const PA_MAX_PLAFOND = 40;
export const CYCLES_PAR_MANDAT_MAIRE = 4;
export const GROUPES_VILLES_MAX = 3;
