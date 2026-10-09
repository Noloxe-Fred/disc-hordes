import { PalierZone } from "@prisma/client";
import type { CleTypeZone } from "./zones";

// Stocks des zones (equilibrage.md §5, « Stocks des zones ») : deux stocks communs par zone, dans lesquels chaque objet
// trouve en fouille puise une unite. Stock vide : l'objet tire ne rapporte rien.

// Ressources naturelles : bois de foret, baies et tous les gibiers ; +50 % du max a chaque aube
export const STOCK_NATUREL_MAX: Record<PalierZone, number> = {
  [PalierZone.PROCHE]: 400,
  [PalierZone.MOYENNE]: 500,
  [PalierZone.ELOIGNEE]: 600,
};
export const REGENERATION_NATURELLE = 0.5;

// Tout le reste du butin : stock de depart, sans regeneration (recharge par un MJ ou un Admin)
export const STOCK_FINI_DEPART: Record<PalierZone, number> = {
  [PalierZone.PROCHE]: 1500,
  [PalierZone.MOYENNE]: 1200,
  [PalierZone.ELOIGNEE]: 900,
};

// Sous ce seuil, la fouille previent que la zone s'epuise
export const SEUIL_INDICE_STOCK = 0.25;

const NATURELS: readonly string[] = ["Baies", "Gibier", "Petit gibier", "Gros gibier", "Gibier rare"];

// Le bois n'est une ressource naturelle (regenerante) qu'en foret
export function estRessourceNaturelle(nomObjet: string, typeZone: CleTypeZone): boolean {
  return NATURELS.includes(nomObjet) || (nomObjet === "Bois" && typeZone === "foret");
}
