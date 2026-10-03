import { Metier } from "@prisma/client";

// Places par metier, fixes independamment de la taille de la ville (conception.md, "Metiers", sur 15 joueurs max
// par ville). Seuls existent les metiers qui ont un effet en jeu (Guetteur, Fossoyeur et Diplomate retires).
// "Sans metier" (2 places) n'est pas une valeur de l'enum Metier : un Joueur.metier a null represente ce cas.
export const PLACES_PAR_METIER: Record<Metier, number> = {
  [Metier.GARDE]: 2,
  [Metier.MEDECIN]: 2,
  [Metier.ARTISAN]: 2,
  [Metier.ECLAIREUR]: 2,
  [Metier.CUISINIER]: 2,
  [Metier.INGENIEUR]: 2,
  [Metier.CHASSEUR]: 1,
};

export const PLACES_SANS_METIER = 2;

export const NOM_METIER: Record<Metier, string> = {
  [Metier.GARDE]: "Garde",
  [Metier.MEDECIN]: "Médecin",
  [Metier.ARTISAN]: "Artisan",
  [Metier.ECLAIREUR]: "Éclaireur",
  [Metier.CUISINIER]: "Cuisinier",
  [Metier.INGENIEUR]: "Ingénieur/bâtisseur",
  [Metier.CHASSEUR]: "Chasseur/trappeur",
};

export const JOUEURS_MAX_PAR_VILLE = 15;
// Minimum d'habitants pour fonder une ville (bouton « Fonder la ville ») ; un membre ayant le role MJ ou Admin peut fonder en dessous (equilibrage.md §1)
export const JOUEURS_MIN_FONDATION = 3;
export const PA_CIBLE_VILLE = 180;
export const PA_MAX_PLAFOND = 40;
export const CYCLES_PAR_MANDAT_MAIRE = 4;
export const GROUPES_VILLES_MAX = 3;
