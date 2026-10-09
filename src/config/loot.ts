import { PalierZone } from "@prisma/client";
import type { CleTypeZone } from "./zones";

// Loot par zone (equilibrage.md §5). Une fouille tire un nombre d'objets entre min et max ; chaque objet est
// tire independamment dans la table, avec les probabilites du document telles quelles. Le reste de la table
// (ex. 10 % pour 50 + 30 + 10 %) correspond a une trouvaille sans valeur : cet objet-la ne rapporte rien.
// Les noms sont ceux du catalogue d'objets (prisma/seed.ts).

export interface TableLoot {
  min: number;
  max: number;
  tirages: { objet: string; probabilite: number }[];
}

export const LOOT_PAR_ZONE: Record<CleTypeZone, Record<PalierZone, TableLoot>> = {
  "ville-en-ruines": {
    [PalierZone.PROCHE]: {
      min: 3,
      max: 5,
      tirages: [
        { objet: "Ferraille", probabilite: 0.4 },
        { objet: "Tissu", probabilite: 0.3 },
        { objet: "Médicament basique", probabilite: 0.08 },
        { objet: "Pièces mécaniques", probabilite: 0.07 },
      ],
    },
    [PalierZone.MOYENNE]: {
      min: 3,
      max: 6,
      tirages: [
        { objet: "Ferraille", probabilite: 0.35 },
        { objet: "Pièces mécaniques", probabilite: 0.3 },
        { objet: "Munitions", probabilite: 0.1 },
        { objet: "Arme simple", probabilite: 0.07 },
        { objet: "Ingrédient de remède", probabilite: 0.04 },
        { objet: "Arme à feu cassée", probabilite: 0.04 },
      ],
    },
    [PalierZone.ELOIGNEE]: {
      min: 4,
      max: 7,
      tirages: [
        { objet: "Pièces mécaniques", probabilite: 0.3 },
        { objet: "Ferraille", probabilite: 0.2 },
        { objet: "Munitions", probabilite: 0.15 },
        { objet: "Arme avancée", probabilite: 0.1 },
        { objet: "Ingrédient de remède", probabilite: 0.08 },
        { objet: "Arme à feu cassée", probabilite: 0.07 },
      ],
    },
  },
  foret: {
    [PalierZone.PROCHE]: {
      min: 3,
      max: 5,
      tirages: [
        { objet: "Bois", probabilite: 0.5 },
        { objet: "Baies", probabilite: 0.25 },
        { objet: "Petit gibier", probabilite: 0.2 },
      ],
    },
    [PalierZone.MOYENNE]: {
      min: 3,
      max: 6,
      tirages: [
        { objet: "Bois", probabilite: 0.45 },
        { objet: "Gibier", probabilite: 0.25 },
        { objet: "Baies", probabilite: 0.15 },
        { objet: "Plante médicinale", probabilite: 0.08 },
        { objet: "Ingrédient de remède", probabilite: 0.04 },
      ],
    },
    [PalierZone.ELOIGNEE]: {
      min: 4,
      max: 7,
      tirages: [
        { objet: "Bois", probabilite: 0.25 },
        { objet: "Gros gibier", probabilite: 0.2 },
        { objet: "Plante médicinale", probabilite: 0.15 },
        { objet: "Bois rare", probabilite: 0.15 },
        { objet: "Ingrédient de remède", probabilite: 0.08 },
      ],
    },
  },
  marecages: {
    [PalierZone.PROCHE]: {
      min: 3,
      max: 5,
      tirages: [
        { objet: "Eau brute", probabilite: 0.55 },
        { objet: "Tissu", probabilite: 0.25 },
        { objet: "Plante médicinale", probabilite: 0.12 },
      ],
    },
    [PalierZone.MOYENNE]: {
      min: 3,
      max: 6,
      tirages: [
        { objet: "Eau brute", probabilite: 0.35 },
        { objet: "Plante médicinale", probabilite: 0.2 },
        { objet: "Tissu", probabilite: 0.2 },
        { objet: "Pièces mécaniques rouillées", probabilite: 0.1 },
        { objet: "Ingrédient de remède", probabilite: 0.04 },
        { objet: "Radio", probabilite: 0.03 },
      ],
    },
    [PalierZone.ELOIGNEE]: {
      min: 4,
      max: 7,
      tirages: [
        { objet: "Plante médicinale", probabilite: 0.25 },
        { objet: "Eau brute", probabilite: 0.2 },
        { objet: "Ingrédient de remède", probabilite: 0.15 },
        { objet: "Objet rare", probabilite: 0.12 },
        { objet: "Radio", probabilite: 0.08 },
      ],
    },
  },
  montagnes: {
    [PalierZone.PROCHE]: {
      min: 3,
      max: 4,
      tirages: [
        { objet: "Pierre", probabilite: 0.55 },
        { objet: "Ferraille", probabilite: 0.2 },
        { objet: "Gibier rare", probabilite: 0.1 },
      ],
    },
    [PalierZone.MOYENNE]: {
      min: 3,
      max: 6,
      tirages: [
        { objet: "Pierre", probabilite: 0.35 },
        { objet: "Ferraille", probabilite: 0.3 },
        { objet: "Gibier", probabilite: 0.1 },
        { objet: "Munitions", probabilite: 0.1 },
        { objet: "Ingrédient de remède", probabilite: 0.04 },
      ],
    },
    [PalierZone.ELOIGNEE]: {
      min: 4,
      max: 7,
      tirages: [
        { objet: "Pierre", probabilite: 0.25 },
        { objet: "Minerai rare", probabilite: 0.2 },
        { objet: "Arme avancée", probabilite: 0.12 },
        { objet: "Pièces pour voiture", probabilite: 0.12 },
        { objet: "Ingrédient de remède", probabilite: 0.08 },
      ],
    },
  },
};
