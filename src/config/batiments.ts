import { TypeBatiment } from "@prisma/client";

// Bonus passifs des batiments (equilibrage.md §7)

// Puits construit (palier 1 ou plus) : a chaque aube, une ration d'eau purifiee par habitant vivant versee dans la
// banque de ville, +25 % au palier 2 (arrondi au superieur)
export const OBJET_EAU_PUITS = "Ration d'eau purifiée";
export const RATIONS_PUITS_PAR_HABITANT = 1;
export const BONUS_PUITS_PALIER_2 = 0.25;

// Chantiers communautaires (equilibrage.md §7) : pour chaque palier, ressources a deposer (depuis le sac ou la banque)
// et PA d'installation (1 PA pour 2 ressources, arrondi au superieur). Les PA peuvent etre verses au fur et a mesure des
// depots, en proportion des ressources deja deposees. La maison privee, personnelle, est geree a part.

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

export const PA_PAR_RESSOURCE = 0.5;

// Objets qui comptent pour plusieurs unites d'une ressource dans les chantiers et la maison (equilibrage.md §5) :
// un Bois rare vaut 5 Bois
const EQUIVALENCES_CHANTIER: Record<string, { ressource: string; valeur: number }> = {
  "Bois rare": { ressource: "Bois", valeur: 5 },
};

// Ressource du palier creditee par un objet depose, et combien d'unites il en vaut
export function ressourceDeposee(nom: string): { ressource: string; valeur: number } {
  return EQUIVALENCES_CHANTIER[nom] ?? { ressource: nom, valeur: 1 };
}

// Objets utiles a un palier : ses ressources et les objets qui en tiennent lieu
export function objetsUtiles(ressources: Iterable<string>): Set<string> {
  const utiles = new Set(ressources);
  for (const [objet, { ressource }] of Object.entries(EQUIVALENCES_CHANTIER)) if (utiles.has(ressource)) utiles.add(objet);
  return utiles;
}

// Depot de `quantite` objets (dont `disponible` en stock) sur une ressource dont il manque `besoin` unites : objets
// pris (pas plus qu'il n'en faut) et unites creditees (jamais plus que le besoin)
export function calculerDepot(nom: string, besoin: number, quantite: number, disponible: number): { pris: number; credit: number } {
  const { valeur } = ressourceDeposee(nom);
  const pris = Math.max(0, Math.min(quantite, Math.ceil(besoin / valeur), disponible));
  return { pris, credit: Math.min(pris * valeur, besoin) };
}

export const CHANTIERS: readonly Chantier[] = [
  {
    type: TypeBatiment.PALISSADE,
    nom: "Palissade",
    emoji: "🧱",
    paliers: [
      { ressources: { Bois: 20, Ferraille: 5 }, pa: 13, bonus: "Défense +5" },
      { ressources: { Bois: 30, Ferraille: 8 }, pa: 19, bonus: "Défense +5 (total +10)" },
      { ressources: { Bois: 45, Ferraille: 12 }, pa: 29, bonus: "Défense +6 (total +16)" },
      { ressources: { Bois: 60, Ferraille: 16 }, pa: 38, bonus: "Défense +6 (total +22)" },
      { ressources: { Bois: 80, Ferraille: 22 }, pa: 51, bonus: "Défense +7 (total +29)" },
      { ressources: { Bois: 100, Ferraille: 28 }, pa: 64, bonus: "Défense +7 (total +36)" },
      { ressources: { Bois: 125, Ferraille: 35 }, pa: 80, bonus: "Défense +8 (total +44)" },
      { ressources: { Bois: 150, Ferraille: 42 }, pa: 96, bonus: "Défense +8 (total +52)" },
    ],
  },
  {
    type: TypeBatiment.PLACE_PUBLIQUE,
    nom: "Place publique",
    emoji: "🏛️",
    paliers: [
      { ressources: { Bois: 25, Tissu: 15 }, pa: 20, bonus: "Banque de ville : capacité 100" },
      { ressources: { Bois: 50, Tissu: 30 }, pa: 40, bonus: "Banque de ville : capacité 200" },
    ],
  },
  {
    type: TypeBatiment.PUITS,
    nom: "Puits",
    emoji: "🪣",
    paliers: [
      { ressources: { Pierre: 20, Ferraille: 8 }, pa: 14, bonus: "1 ration d'eau purifiée par habitant chaque aube" },
      { ressources: { Pierre: 40, Ferraille: 15 }, pa: 28, bonus: "Production du puits +25 %" },
    ],
  },
  {
    type: TypeBatiment.ATELIER,
    nom: "Atelier",
    emoji: "🔧",
    paliers: [
      { ressources: { Bois: 15, Ferraille: 25, "Pièces mécaniques": 8 }, pa: 24, bonus: "Craft avancé de base (à venir)" },
      { ressources: { Bois: 25, Ferraille: 40, "Pièces mécaniques": 15 }, pa: 40, bonus: "Recettes avancées supplémentaires (à venir)" },
    ],
  },
  {
    // Effets appliques dans synchroniserAccesJoueur (discord/joueurDiscord.ts)
    type: TypeBatiment.TOUR_RADIO,
    nom: "Tour Radio",
    emoji: "📡",
    paliers: [
      {
        ressources: { Bois: 10, Ferraille: 15, "Pièces mécaniques": 8 },
        pa: 17,
        bonus: "Ondes radio ouvertes à tous les habitants, ville visible de dehors pour les porteurs de radio",
      },
    ],
  },
  {
    type: TypeBatiment.MAIRIE,
    nom: "Mairie",
    emoji: "🏢",
    paliers: [{ ressources: { Bois: 30, Pierre: 15 }, pa: 23, bonus: "Élections, décisions, rationnement (à venir)" }],
  },
];

export function chantier(type: TypeBatiment): Chantier {
  return CHANTIERS.find((c) => c.type === type)!;
}

// Maison privee (equilibrage.md §7) : personnelle, chaque joueur arrive sans maison (palier 0) et la construit avec la
// meme mecanique que les chantiers (depots depuis le sac ou la banque, puis PA d'installation). Ses effets sont
// appliques ailleurs : chance d'etre touche a l'attaque (game/blessuresNuit.ts), +15 % de PA max au palier 2 (game/pa.ts).
export const PALIERS_MAISON: readonly PalierBatiment[] = [
  { ressources: { Bois: 10, Tissu: 5 }, pa: 8, bonus: "Un toit à soi" },
  { ressources: { Bois: 25, Tissu: 12 }, pa: 19, bonus: "+15 % de PA max, 25 % de chance de repousser les zombies à l'attaque" },
];
