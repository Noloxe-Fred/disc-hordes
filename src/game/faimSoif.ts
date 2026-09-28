import { CauseMort } from "@prisma/client";
import {
  DECROISSANCE_FAIM_PAR_PHASE,
  DECROISSANCE_SOIF_PAR_PHASE,
  PV_PERDUS_JAUGE_CRITIQUE,
  PV_PERDUS_JAUGE_VIDE,
  SEUIL_ALERTE_FAIM_SOIF,
  SEUIL_CRITIQUE_FAIM_SOIF,
} from "../config/sante";

// Decroissance de la faim et de la soif a chaque changement de phase (equilibrage.md §2), PV perdus par
// jauge (1 PV sous le seuil critique, 2 PV a 0), phases passees a 0 (malus de PA, voir game/pa.ts) et
// alertes au passage d'un palier : sous le seuil d'alerte, sous le seuil critique, puis a 0.

export type Jauge = "faim" | "soif";
export type NiveauJauge = "normal" | "alerte" | "critique" | "vide";

export function niveauJauge(valeur: number): NiveauJauge {
  if (valeur <= 0) return "vide";
  if (valeur < SEUIL_CRITIQUE_FAIM_SOIF) return "critique";
  if (valeur < SEUIL_ALERTE_FAIM_SOIF) return "alerte";
  return "normal";
}

const GRAVITE: Record<NiveauJauge, number> = { normal: 0, alerte: 1, critique: 2, vide: 3 };

function pvPerdusJauge(valeur: number): number {
  if (valeur <= 0) return PV_PERDUS_JAUGE_VIDE;
  if (valeur < SEUIL_CRITIQUE_FAIM_SOIF) return PV_PERDUS_JAUGE_CRITIQUE;
  return 0;
}

export interface EtatFaimSoif {
  faim: number;
  soif: number;
  phasesFaimVide: number;
  phasesSoifVide: number;
}

export interface EffetPhaseFaimSoif extends EtatFaimSoif {
  pvPerdus: number;
  // Cause retenue si ces pertes tuent le joueur : la jauge qui fait le plus de degats (soif si egalite)
  cause: CauseMort;
  // Jauges passees a un palier plus grave pendant cette phase
  alertes: { jauge: Jauge; niveau: NiveauJauge; valeur: number }[];
}

// Premiere phase a 0 : compteur a 0 ; chaque phase suivante encore a 0 l'incremente ; remis a 0 si la jauge remonte
function phasesVide(ancienne: number, nouvelle: number, compteur: number): number {
  if (nouvelle > 0) return 0;
  return ancienne <= 0 ? compteur + 1 : 0;
}

export function appliquerPhaseFaimSoif(etat: EtatFaimSoif): EffetPhaseFaimSoif {
  const faim = Math.max(0, etat.faim - DECROISSANCE_FAIM_PAR_PHASE);
  const soif = Math.max(0, etat.soif - DECROISSANCE_SOIF_PAR_PHASE);
  const pvFaim = pvPerdusJauge(faim);
  const pvSoif = pvPerdusJauge(soif);

  const alertes: EffetPhaseFaimSoif["alertes"] = [];
  for (const [jauge, avant, apres] of [
    ["faim", etat.faim, faim],
    ["soif", etat.soif, soif],
  ] as const) {
    const niveau = niveauJauge(apres);
    if (GRAVITE[niveau] > GRAVITE[niveauJauge(avant)]) alertes.push({ jauge, niveau, valeur: apres });
  }

  return {
    faim,
    soif,
    phasesFaimVide: phasesVide(etat.faim, faim, etat.phasesFaimVide),
    phasesSoifVide: phasesVide(etat.soif, soif, etat.phasesSoifVide),
    pvPerdus: pvFaim + pvSoif,
    cause: pvFaim > pvSoif ? CauseMort.FAIM : CauseMort.SOIF,
    alertes,
  };
}
