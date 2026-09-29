import { Metier } from "@prisma/client";
import { COUT_SOIN_AVANCE_JOUR, COUT_SOIN_BASIQUE_JOUR } from "./deplacement";
import { SOIN_AVANCE_PV, SOIN_BASIQUE_PV } from "./sante";

// Soins (equilibrage.md §1 et §4, « Soins ») : sur soi ou sur un survivant au meme endroit, PV plafonnes a 10.
// Basique ouvert a tous avec un bandage ; avance reserve au medecin, avec un medicament basique ou un bandage et une
// plante medicinale au choix.

export interface Soin {
  id: string;
  libelle: string;
  pv: number;
  coutJour: number;
  ingredients: { nom: string; quantite: number }[];
  metier?: Metier;
  // Remede contre l'infection : guerit l'infection de la cible au lieu de rendre des PV (gratuit en PA)
  gueritInfection?: boolean;
}

export const SOINS: readonly Soin[] = [
  { id: "basique", libelle: "Soin basique", pv: SOIN_BASIQUE_PV, coutJour: COUT_SOIN_BASIQUE_JOUR, ingredients: [{ nom: "Bandage", quantite: 1 }] },
  {
    id: "avance-medicament",
    libelle: "Soin avancé",
    pv: SOIN_AVANCE_PV,
    coutJour: COUT_SOIN_AVANCE_JOUR,
    ingredients: [{ nom: "Médicament basique", quantite: 1 }],
    metier: Metier.MEDECIN,
  },
  {
    id: "avance-plante",
    libelle: "Soin avancé",
    pv: SOIN_AVANCE_PV,
    coutJour: COUT_SOIN_AVANCE_JOUR,
    ingredients: [
      { nom: "Bandage", quantite: 1 },
      { nom: "Plante médicinale", quantite: 1 },
    ],
    metier: Metier.MEDECIN,
  },
  {
    id: "remede",
    libelle: "Remède contre l'infection",
    pv: 0,
    coutJour: 0,
    ingredients: [{ nom: "Remède contre l'infection", quantite: 1 }],
    metier: Metier.MEDECIN,
    gueritInfection: true,
  },
];

export function soinsPossibles(metier: Metier | null): Soin[] {
  return SOINS.filter((s) => s.metier === undefined || s.metier === metier);
}
