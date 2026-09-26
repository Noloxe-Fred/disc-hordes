import { PalierZone } from "@prisma/client";

// Territoires externes d'un groupe de villes : 4 types de zone (equilibrage.md §5, loot par zone)
// declines en 3 paliers d'eloignement, soit 12 zones par groupe, chacune avec son salon.
export const TYPES_ZONE = [
  { cle: "ville-en-ruines", nom: "Ville en ruines" },
  { cle: "foret", nom: "Forêt" },
  { cle: "marecages", nom: "Marécages" },
  { cle: "montagnes", nom: "Montagnes" },
] as const;

export const PALIERS_ZONE = [
  { palier: PalierZone.PROCHE, nom: "proche" },
  { palier: PalierZone.MOYENNE, nom: "moyenne" },
  { palier: PalierZone.ELOIGNEE, nom: "éloignée" },
] as const;

// Nom du salon Discord d'une zone, ex. "forêt-proche"
export function nomSalonZone(nomType: string, nomPalier: string): string {
  return `${nomType} ${nomPalier}`.toLowerCase().replace(/\s+/g, "-");
}
