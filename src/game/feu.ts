// Debut de la phase en cours d'une ville (inconnu avant la premiere bascule : depuis toujours)
export function debutPhase(ville: { phaseDepuis: Date | null }): Date {
  return ville.phaseDepuis ?? new Date(0);
}

// Feu actif dans une zone : allume depuis le debut de la phase en cours de la ville du joueur (il s'eteint au
// changement de phase, y compris force par un admin)
export function feuActif(zone: { feuAllumeLe: Date | null } | null, ville: { phaseDepuis: Date | null }): boolean {
  return zone?.feuAllumeLe != null && zone.feuAllumeLe >= debutPhase(ville);
}
