// Election du maire (conception.md §5, equilibrage.md §2 « Élection du maire ») : durees reelles, independantes du
// cycle jour/nuit.

// Duree des candidatures apres le declenchement, puis duree du vote (un revote entre ex aequo s'ouvre directement au vote)
export const DUREE_CANDIDATURES_HEURES = 24;
export const DUREE_VOTE_HEURES = 24;

// Duree du vote de defiance, ouvert des son declenchement (conception.md §5)
export const DUREE_DEFIANCE_HEURES = 24;

// Frequence de verification des elections arrivees a une echeance (fin des candidatures, fin du vote)
export const INTERVALLE_VERIFICATION_ELECTIONS_MS = 60_000;
