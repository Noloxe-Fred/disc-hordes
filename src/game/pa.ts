import type { Joueur } from "@prisma/client";
import {
  ATTENUATION_INFUSION_POINTS,
  BONUS_PA_MAISON_PALIER_2,
  JAUGE_MAX,
  MALUS_PA_JAUGE_MAX,
  MALUS_PA_PAR_PHASE_JAUGE_VIDE,
  MALUS_PA_PAR_PV_MANQUANT,
  PV_MAX,
} from "../config/sante";
import { calculerEtatInfection } from "./infection";

// PA max effectif (equilibrage.md §1-2) : chaque modificateur est un pourcentage du PA max individuel fige a
// l'arrivee ; ils s'additionnent, puis le total est applique en une fois (arrondi a l'inferieur, jamais sous 0).

export interface ModificateurPa {
  libelle: string;
  fraction: number; // negative pour un malus
}

export interface EtatPa {
  paMaxBase: number;
  paMax: number;
  modificateurs: ModificateurPa[];
}

type JoueurPa = Pick<
  Joueur,
  "paMax" | "pv" | "faim" | "soif" | "phasesFaimVide" | "phasesSoifVide" | "infecteDepuis" | "maisonPalier" | "infusionJusqua"
>;

// Malus progressif : faible quand la jauge commence a baisser, de plus en plus fort en approchant de 0
// (100 : 0 %, 70 : -2,7 %, 30 : -14,7 %, 0 : -30 %), puis -15 % par phase supplementaire a 0
function malusJauge(valeur: number, phasesVide: number): number {
  const manque = Math.min(JAUGE_MAX, Math.max(0, JAUGE_MAX - valeur)) / JAUGE_MAX;
  return MALUS_PA_JAUGE_MAX * manque * manque + (valeur <= 0 ? phasesVide * MALUS_PA_PAR_PHASE_JAUGE_VIDE : 0);
}

export function calculerPaMax(joueur: JoueurPa, maintenant: Date = new Date()): EtatPa {
  const paMaxBase = joueur.paMax ?? 0;
  const modificateurs: ModificateurPa[] = [];

  const pvManquants = Math.min(PV_MAX, Math.max(0, PV_MAX - joueur.pv));
  if (pvManquants > 0) modificateurs.push({ libelle: "blessures", fraction: -pvManquants * MALUS_PA_PAR_PV_MANQUANT });

  const malusFaim = malusJauge(joueur.faim, joueur.phasesFaimVide);
  if (malusFaim > 0) modificateurs.push({ libelle: "faim", fraction: -malusFaim });
  const malusSoif = malusJauge(joueur.soif, joueur.phasesSoifVide);
  if (malusSoif > 0) modificateurs.push({ libelle: "soif", fraction: -malusSoif });

  if (joueur.infecteDepuis) {
    const { malusPaPourcent: malusBrut } = calculerEtatInfection(joueur.infecteDepuis, maintenant);
    // Infusion medicinale bue pendant la phase : malus attenue
    const attenuation = joueur.infusionJusqua && joueur.infusionJusqua > maintenant ? ATTENUATION_INFUSION_POINTS : 0;
    const malusPaPourcent = Math.max(0, malusBrut - attenuation);
    if (malusPaPourcent > 0) modificateurs.push({ libelle: "infection", fraction: -malusPaPourcent / 100 });
  }

  if (joueur.maisonPalier >= 2) modificateurs.push({ libelle: "maison", fraction: BONUS_PA_MAISON_PALIER_2 });

  const total = modificateurs.reduce((somme, m) => somme + m.fraction, 0);
  // Arrondi du produit avant la troncature : 20 x (1 - 0,15) vaut 16,999... en virgule flottante
  const paMax = Math.floor(Math.round(paMaxBase * (1 + total) * 1e6) / 1e6);
  return { paMaxBase, paMax: Math.max(0, paMax), modificateurs };
}
