import { PalierZone, TypePiege } from "@prisma/client";
import type { CleTypeZone } from "./zones";

// Pieges (equilibrage.md §6 et §8) : le piege simple (craft simple) capture du Gibier, le piege avance du chasseur du
// Gros gibier. Poses dans une zone de foret ou de montagnes (la ou vit le gibier, §5), un seul par zone, permanents.
// A chaque aube, un piege vide capture sa proie avec une chance qui croit avec l'eloignement de la zone (puisee dans le
// stock naturel de la zone) ; la prise attend dedans qu'un survivant present la releve.
export const PIEGES: Record<TypePiege, { objet: string; prise: string }> = {
  [TypePiege.SIMPLE]: { objet: "Piège simple", prise: "Gibier" },
  [TypePiege.AVANCE]: { objet: "Pièges avancés", prise: "Gros gibier" },
};

export const CHANCE_CAPTURE_PIEGE: Record<PalierZone, number> = {
  [PalierZone.PROCHE]: 0.6,
  [PalierZone.MOYENNE]: 0.75,
  [PalierZone.ELOIGNEE]: 0.9,
};

export const TYPES_ZONE_PIEGE: readonly CleTypeZone[] = ["foret", "montagnes"];

// Poser un piege (consomme le piege du sac) ; relever sa prise est gratuit
export const COUT_POSE_PIEGE_JOUR = 1;
