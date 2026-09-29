// Defense de la ville et attaque de zombies — equilibrage.md §3.
export const DEFENSE_BASE = 5;
export const BONUS_GARDE_CITOYEN = 3;
export const BONUS_GARDE_METIER = 6;
// Se porter volontaire pour la garde (nuit uniquement, equilibrage.md §4)
export const COUT_GARDE = 6;

// Bonus de palissade cumule par palier (index 0 = pas de palissade).
export const BONUS_PALISSADE_CUMULE: readonly number[] = [0, 5, 10, 16, 22, 29, 36, 44, 52];

export const FORCE_ATTAQUE_BASE = 15;
export const CROISSANCE_ATTAQUE_PAR_CYCLE = 0.1; // +10% compose par cycle
export const MODIFICATEUR_METEO_MAUVAIS = 0.15; // +15%

// Alerte postee dans la mairie des villes en nuit, avant l'attaque de l'aube (minuit)
export const AVANCE_ALERTE_ATTAQUE_MINUTES = 60;
