// Points de vie, faim/soif et attaque nocturne : valeurs d'equilibrage.md §1 a §3.

export const PV_MAX = 10;
// Chaque PV manquant retire 5 % du PA max (10 PV : 0 %, 1 PV : -45 %)
export const MALUS_PA_PAR_PV_MANQUANT = 0.05;

export const SOIN_BASIQUE_PV = 2;
export const SOIN_AVANCE_PV = 5;

// Chance d'infection a chaque coup recu (attaque de nuit, combat en territoire externe)
export const CHANCE_INFECTION_PAR_COUP = 0.1;

// Attaque nocturne : chance d'etre touche = min(50 %, deficit / attaque), reduite de 25 % par palier
// de maison au-dela du palier 1 (plancher x0,25) ; PV perdus = ceil(ratio x 10), soit 1 a 5 PV.
export const RATIO_TOUCHE_MAX = 0.5;
export const REDUCTION_TOUCHE_PAR_PALIER_MAISON = 0.25;
export const FACTEUR_TOUCHE_MAISON_MIN = 0.25;
export const FACTEUR_DEGATS_NUIT = 10;

// Faim et soif (jauges 0-100)
export const DECROISSANCE_FAIM_PAR_PHASE = 16;
export const DECROISSANCE_SOIF_PAR_PHASE = 20;
export const SEUIL_CRITIQUE_FAIM_SOIF = 10;
// PV perdus par phase et par jauge : sous le seuil critique, puis a 0
export const PV_PERDUS_JAUGE_CRITIQUE = 1;
export const PV_PERDUS_JAUGE_VIDE = 2;

// Seuils de faim/soif (equilibrage.md §2) : message d'alerte sous 30. Malus de PA max progressif des que la jauge
// baisse : 30 % x ((100 - jauge) / 100)^2 par jauge (0 % a 100, -30 % a 0), puis -15 % de plus par phase
// supplementaire passee a 0 (cumulable, jauges faim et soif comptees separement)
export const JAUGE_MAX = 100;
export const SEUIL_ALERTE_FAIM_SOIF = 30;
export const MALUS_PA_JAUGE_MAX = 0.3;
export const MALUS_PA_PAR_PHASE_JAUGE_VIDE = 0.15;

// Maison privee palier 2 : +15 % de PA max (equilibrage.md §1)
export const BONUS_PA_MAISON_PALIER_2 = 0.15;

// Sieste en territoire externe, pres d'un feu : +25 % du PA max effectif, une fois par phase (equilibrage.md §1)
export const FRACTION_PA_SIESTE = 0.25;
