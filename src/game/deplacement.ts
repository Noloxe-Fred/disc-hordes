import { Metier, TypePhase, type PalierZone } from "@prisma/client";
import {
  COUT_DEPLACEMENT_JOUR,
  COUT_OBSERVATION_ECLAIREUR,
  COUT_OBSERVATION_JOUR,
  COUT_RETOUR_VILLE_JOUR,
  MAJORATION_NUIT,
} from "../config/deplacement";

function selonPhase(coutJour: number, phase: TypePhase): number {
  return phase === TypePhase.NUIT ? Math.ceil(coutJour * MAJORATION_NUIT) : coutJour;
}

// Cout en PA d'un deplacement vers une zone de ce palier, ou vers la ville (null), selon la phase
export function coutDeplacement(palierDestination: PalierZone | null, phase: TypePhase): number {
  return selonPhase(palierDestination === null ? COUT_RETOUR_VILLE_JOUR : COUT_DEPLACEMENT_JOUR[palierDestination], phase);
}

// Cout en PA d'une observation des zones adjacentes, selon la phase et le metier (reduit pour l'eclaireur)
export function coutObservation(phase: TypePhase, metier: Metier | null): number {
  if (metier === Metier.ECLAIREUR) return COUT_OBSERVATION_ECLAIREUR[phase];
  return selonPhase(COUT_OBSERVATION_JOUR, phase);
}
