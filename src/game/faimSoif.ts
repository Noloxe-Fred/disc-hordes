import { CauseMort } from "@prisma/client";
import {
  DECROISSANCE_FAIM_PAR_PHASE,
  DECROISSANCE_SOIF_PAR_PHASE,
  PV_PERDUS_JAUGE_CRITIQUE,
  PV_PERDUS_JAUGE_VIDE,
  SEUIL_CRITIQUE_FAIM_SOIF,
} from "../config/sante";

// Decroissance de la faim et de la soif a chaque changement de phase (equilibrage.md §2), et PV
// perdus par jauge : 1 PV sous le seuil critique, 2 PV a 0.

function pvPerdusJauge(valeur: number): number {
  if (valeur <= 0) return PV_PERDUS_JAUGE_VIDE;
  if (valeur < SEUIL_CRITIQUE_FAIM_SOIF) return PV_PERDUS_JAUGE_CRITIQUE;
  return 0;
}

export interface EffetPhaseFaimSoif {
  faim: number;
  soif: number;
  pvPerdus: number;
  // Cause retenue si ces pertes tuent le joueur : la jauge qui fait le plus de degats (soif si egalite)
  cause: CauseMort;
}

export function appliquerPhaseFaimSoif(faim: number, soif: number): EffetPhaseFaimSoif {
  const nouvelleFaim = Math.max(0, faim - DECROISSANCE_FAIM_PAR_PHASE);
  const nouvelleSoif = Math.max(0, soif - DECROISSANCE_SOIF_PAR_PHASE);
  const pvFaim = pvPerdusJauge(nouvelleFaim);
  const pvSoif = pvPerdusJauge(nouvelleSoif);
  return {
    faim: nouvelleFaim,
    soif: nouvelleSoif,
    pvPerdus: pvFaim + pvSoif,
    cause: pvFaim > pvSoif ? CauseMort.FAIM : CauseMort.SOIF,
  };
}
