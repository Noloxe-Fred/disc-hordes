import { TypeBatiment } from "@prisma/client";

// Bonus passifs des batiments (equilibrage.md §7)

// Puits construit (palier 1 ou plus) : a chaque aube, une ration d'eau purifiee par habitant vivant versee dans la
// banque de ville, +25 % au palier 2 (arrondi au superieur)
export const OBJET_EAU_PUITS = "Ration d'eau purifiée";
export const RATIONS_PUITS_PAR_HABITANT = 1;
export const BONUS_PUITS_PALIER_2 = 0.25;

// Chantiers communautaires (equilibrage.md §7) : pour chaque palier, ressources a deposer (depuis le sac ou la banque)
// et PA d'installation (2 PA par tranche de 10 ressources). Les PA peuvent etre verses au fur et a mesure des depots,
// en proportion des ressources deja deposees. La maison privee, personnelle, est geree a part.

export interface PalierBatiment {
  ressources: Record<string, number>;
  pa: number;
  bonus: string;
}

export interface Chantier {
  type: TypeBatiment;
  nom: string;
  emoji: string;
  paliers: PalierBatiment[];
}

export const PA_PAR_RESSOURCE = 0.2;

export const CHANTIERS: readonly Chantier[] = [
  {
    type: TypeBatiment.PALISSADE,
    nom: "Palissade",
    emoji: "🧱",
    paliers: [
      { ressources: { Bois: 40, Ferraille: 10 }, pa: 10, bonus: "Défense +5" },
      { ressources: { Bois: 60, Ferraille: 15 }, pa: 15, bonus: "Défense +5 (total +10)" },
      { ressources: { Bois: 90, Ferraille: 25 }, pa: 23, bonus: "Défense +6 (total +16)" },
      { ressources: { Bois: 130, Ferraille: 35 }, pa: 33, bonus: "Défense +6 (total +22)" },
      { ressources: { Bois: 180, Ferraille: 50 }, pa: 46, bonus: "Défense +7 (total +29)" },
      { ressources: { Bois: 240, Ferraille: 70 }, pa: 62, bonus: "Défense +7 (total +36)" },
      { ressources: { Bois: 310, Ferraille: 90 }, pa: 80, bonus: "Défense +8 (total +44)" },
      { ressources: { Bois: 400, Ferraille: 120 }, pa: 104, bonus: "Défense +8 (total +52)" },
    ],
  },
  {
    type: TypeBatiment.PLACE_PUBLIQUE,
    nom: "Place publique",
    emoji: "🏛️",
    paliers: [
      { ressources: { Bois: 50, Tissu: 30 }, pa: 16, bonus: "Banque de ville : capacité 80" },
      { ressources: { Bois: 90, Tissu: 60 }, pa: 30, bonus: "Banque de ville : capacité 160" },
    ],
  },
  {
    type: TypeBatiment.PUITS,
    nom: "Puits",
    emoji: "🪣",
    paliers: [
      { ressources: { Pierre: 50, Ferraille: 20 }, pa: 14, bonus: "1 ration d'eau purifiée par habitant chaque aube" },
      { ressources: { Pierre: 90, Ferraille: 40 }, pa: 26, bonus: "Production du puits +25 %" },
    ],
  },
  {
    type: TypeBatiment.ATELIER,
    nom: "Atelier",
    emoji: "🔧",
    paliers: [
      { ressources: { Bois: 30, Ferraille: 60, "Pièces mécaniques": 15 }, pa: 21, bonus: "Craft avancé de base (à venir)" },
      { ressources: { Bois: 40, Ferraille: 100, "Pièces mécaniques": 30 }, pa: 34, bonus: "Recettes avancées supplémentaires (à venir)" },
    ],
  },
  {
    // Effets appliques dans synchroniserAccesJoueur (discord/joueurDiscord.ts)
    type: TypeBatiment.TOUR_RADIO,
    nom: "Tour Radio",
    emoji: "📡",
    paliers: [
      {
        ressources: { Bois: 20, Ferraille: 40, "Pièces mécaniques": 20 },
        pa: 16,
        bonus: "Ondes radio ouvertes à tous les habitants, ville visible de dehors pour les porteurs de radio",
      },
    ],
  },
  {
    type: TypeBatiment.MAIRIE,
    nom: "Mairie",
    emoji: "🏢",
    paliers: [{ ressources: { Bois: 80, Pierre: 40 }, pa: 24, bonus: "Élections, décisions, rationnement (à venir)" }],
  },
];

export function chantier(type: TypeBatiment): Chantier {
  return CHANTIERS.find((c) => c.type === type)!;
}

// Maison privee (equilibrage.md §7) : personnelle, chaque joueur arrive sans maison (palier 0) et la construit avec la
// meme mecanique que les chantiers (depots depuis le sac ou la banque, puis PA d'installation). Ses effets sont
// appliques ailleurs : chance d'etre touche a l'attaque (game/blessuresNuit.ts), +15 % de PA max au palier 2 (game/pa.ts).
export const PALIERS_MAISON: readonly PalierBatiment[] = [
  { ressources: { Bois: 30, Tissu: 15 }, pa: 9, bonus: "Un toit à soi" },
  { ressources: { Bois: 50, Tissu: 30 }, pa: 16, bonus: "+15 % de PA max, 25 % de chance de repousser les zombies à l'attaque" },
];
