// Defense de la ville et attaque de zombies — equilibrage.md §3.
export const DEFENSE_BASE = 5;
export const BONUS_GARDE_CITOYEN = 3;
export const BONUS_GARDE_METIER = 6;
// Se porter volontaire pour la garde (nuit uniquement, equilibrage.md §4)
export const COUT_GARDE = 6;

// Structures de defense avancees (ingenieur, equilibrage.md §8) : +3 defense chacune tant qu'elle n'est pas detruite par une attaque, 5 au plus (+15)
export const OBJET_STRUCTURE_DEFENSE = "Structures de défense avancées";
export const BONUS_STRUCTURE_DEFENSE = 3;
export const STRUCTURES_DEFENSE_MAX = 5;
// Structure renforcee (ingenieur, atelier palier 2) : +5 defense ; comptee dans le maximum de 5 avec les structures
// simples. Ville pleine, en poser une detruit une structure simple pour prendre sa place.
export const OBJET_STRUCTURE_RENFORCEE = "Structure renforcée";
export const BONUS_STRUCTURE_RENFORCEE = 5;

// Bonus de defense des structures posees
export function bonusStructures(simples: number, renforcees: number): number {
  return simples * BONUS_STRUCTURE_DEFENSE + renforcees * BONUS_STRUCTURE_RENFORCEE;
}

// Bonus de palissade cumule par palier (index 0 = pas de palissade).
export const BONUS_PALISSADE_CUMULE: readonly number[] = [0, 5, 10, 16, 22, 29, 36, 44, 52];

// Degats sur les chantiers en defense insuffisante (equilibrage.md §3, game/degatsChantiers.ts) : chaque point de
// deficit restant apres structures et palissade detruit 10 % de l'avancement en cours (10 points au plus), puis
// 5 points restants font perdre un palier a un batiment tire au hasard.
export const PART_AVANCEMENT_PAR_POINT = 0.1;
export const POINTS_MAX_AVANCEMENT = 10;
export const SEUIL_PERTE_PALIER_ALEATOIRE = 5;

export const FORCE_ATTAQUE_BASE = 10;
export const CROISSANCE_ATTAQUE_PAR_CYCLE = 0.13; // +13% compose par cycle
export const MODIFICATEUR_METEO_MAUVAIS = 0.15; // +15%

// Alerte postee dans la mairie des villes en nuit, avant l'attaque de l'aube (minuit)
export const AVANCE_ALERTE_ATTAQUE_MINUTES = 60;
