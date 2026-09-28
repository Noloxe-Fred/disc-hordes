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
      min: 2,
      max: 3,
      tirages: [
        { objet: "Tissu", probabilite: 0.5 },
        { objet: "Ferraille", probabilite: 0.3 },
        { objet: "Médicament basique", probabilite: 0.1 },
      ],
    },
    [PalierZone.MOYENNE]: {
      min: 2,
      max: 4,
      tirages: [
        { objet: "Ferraille", probabilite: 0.3 },
        { objet: "Pièces mécaniques", probabilite: 0.3 },
        { objet: "Munitions", probabilite: 0.15 },
        { objet: "Arme simple", probabilite: 0.1 },
        { objet: "Ingrédient de remède", probabilite: 0.05 },
      ],
    },
    [PalierZone.ELOIGNEE]: {
      min: 3,
      max: 5,
      tirages: [
        { objet: "Pièces mécaniques", probabilite: 0.25 },
        { objet: "Munitions", probabilite: 0.2 },
        { objet: "Arme avancée", probabilite: 0.15 },
        { objet: "Ingrédient de remède", probabilite: 0.1 },
      ],
    },
  },
  foret: {
    [PalierZone.PROCHE]: {
      min: 2,
      max: 3,
      tirages: [
        { objet: "Bois", probabilite: 0.55 },
        { objet: "Baies", probabilite: 0.25 },
        { objet: "Petit gibier", probabilite: 0.15 },
      ],
    },
    [PalierZone.MOYENNE]: {
      min: 2,
      max: 4,
      tirages: [
        { objet: "Bois", probabilite: 0.35 },
        { objet: "Gibier", probabilite: 0.3 },
        { objet: "Baies", probabilite: 0.15 },
        { objet: "Plante médicinale", probabilite: 0.1 },
        { objet: "Ingrédient de remède", probabilite: 0.05 },
      ],
    },
    [PalierZone.ELOIGNEE]: {
      min: 3,
      max: 5,
      tirages: [
        { objet: "Gros gibier", probabilite: 0.25 },
        { objet: "Plante médicinale", probabilite: 0.2 },
        { objet: "Bois rare", probabilite: 0.15 },
        { objet: "Ingrédient de remède", probabilite: 0.1 },
      ],
    },
  },
  marecages: {
    [PalierZone.PROCHE]: {
      min: 2,
      max: 3,
      tirages: [
        { objet: "Eau brute", probabilite: 0.45 },
        { objet: "Tissu", probabilite: 0.25 },
        { objet: "Plante médicinale", probabilite: 0.15 },
      ],
    },
    [PalierZone.MOYENNE]: {
      min: 2,
      max: 4,
      tirages: [
        { objet: "Eau brute", probabilite: 0.3 },
        { objet: "Plante médicinale", probabilite: 0.25 },
        { objet: "Tissu", probabilite: 0.2 },
        { objet: "Pièces mécaniques rouillées", probabilite: 0.1 },
        { objet: "Ingrédient de remède", probabilite: 0.05 },
        { objet: "Radio", probabilite: 0.05 },
      ],
    },
    [PalierZone.ELOIGNEE]: {
      min: 3,
      max: 5,
      tirages: [
        { objet: "Plante médicinale", probabilite: 0.25 },
        { objet: "Ingrédient de remède", probabilite: 0.2 },
        { objet: "Objet rare", probabilite: 0.15 },
        { objet: "Radio", probabilite: 0.1 },
      ],
    },
  },
  montagnes: {
    [PalierZone.PROCHE]: {
      min: 2,
      max: 2,
      tirages: [
        { objet: "Pierre", probabilite: 0.45 },
        { objet: "Gibier rare", probabilite: 0.2 },
      ],
    },
    [PalierZone.MOYENNE]: {
      min: 2,
      max: 4,
      tirages: [
        { objet: "Pierre", probabilite: 0.3 },
        { objet: "Ferraille", probabilite: 0.25 },
        { objet: "Munitions", probabilite: 0.15 },
        { objet: "Ingrédient de remède", probabilite: 0.05 },
      ],
    },
    [PalierZone.ELOIGNEE]: {
      min: 3,
      max: 5,
      tirages: [
        { objet: "Minerai rare", probabilite: 0.25 },
        { objet: "Arme avancée", probabilite: 0.2 },
        { objet: "Pièces pour voiture", probabilite: 0.15 },
        { objet: "Ingrédient de remède", probabilite: 0.1 },
      ],
    },
  },
};
