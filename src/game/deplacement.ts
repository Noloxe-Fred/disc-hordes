import { TypePhase, type PalierZone } from "@prisma/client";
import { COUT_DEPLACEMENT_JOUR, COUT_RETOUR_VILLE_JOUR, MAJORATION_NUIT } from "../config/deplacement";

// Cout en PA d'un deplacement vers une zone de ce palier, ou vers la ville (null), selon la phase
export function coutDeplacement(palierDestination: PalierZone | null, phase: TypePhase): number {
  const coutJour = palierDestination === null ? COUT_RETOUR_VILLE_JOUR : COUT_DEPLACEMENT_JOUR[palierDestination];
  return phase === TypePhase.NUIT ? Math.ceil(coutJour * MAJORATION_NUIT) : coutJour;
}
