// Emoji de chaque objet du catalogue (prisma/seed.ts), affiche dans les textes et, en image Twemoji, dans le
// rendu du sac. Un objet absent de la liste prend l'emoji par defaut.
const EMOJI_OBJET: Record<string, string> = {
  // Ressources brutes
  Bois: "🪵",
  Tissu: "🧵",
  Ferraille: "🔩",
  Pierre: "🪨",
  "Eau brute": "💧",
  Baies: "🫐",
  Gibier: "🍖",
  "Plante médicinale": "🌿",
  "Pièces mécaniques": "⚙️",
  "Ingrédient de remède": "🧪",
  Munitions: "🧨",
  // Loot rare
  Radio: "📻",
  "Médicament basique": "💊",
  "Arme simple": "🔪",
  "Arme avancée": "🏹",
  "Arme à feu cassée": "🪛",
  "Petit gibier": "🐇",
  "Gros gibier": "🦌",
  "Gibier rare": "🐐",
  "Bois rare": "🌳",
  "Minerai rare": "💎",
  "Pièces mécaniques rouillées": "🔧",
  "Pièces pour voiture": "🛞",
  "Objet rare": "🏺",
  // Craft simple
  Bandage: "🩹",
  "Plat préparé": "🍲",
  Feu: "🔥",
  "Arme de fortune": "🗡️",
  "Ration d'eau purifiée": "🍶",
  Torche: "🔦",
  "Piège simple": "🪤",
  // Craft avance
  "Remède contre l'infection": "💉",
  "Réparation voiture": "🚗",
  "Structures de défense avancées": "🛡️",
  "Ragoût fortifiant": "🥘",
  "Conserve longue durée": "🥫",
  "Infusion médicinale": "🍵",
  "Pièges avancés": "⛓️",
  "Armes/outils avancés": "🛠️",
  Festin: "🍗",
  "Structure renforcée": "🏰",
  "Arme à feu": "🔫",
};

const EMOJI_PAR_DEFAUT = "📦";

export function emojiObjet(nom: string): string {
  return EMOJI_OBJET[nom] ?? EMOJI_PAR_DEFAUT;
}

// Poids de chaque objet (equilibrage.md §5, « Poids et capacite ») : petit 1, moyen 2, lourd 3. Il compte de la meme
// facon dans le sac et dans la banque de ville. Un objet absent de la liste est moyen.
const PETIT = 1;
const MOYEN = 2;
const LOURD = 3;

const POIDS_OBJET: Record<string, number> = {
  // Ressources brutes
  Bois: MOYEN,
  Tissu: PETIT,
  Ferraille: MOYEN,
  Pierre: LOURD,
  "Eau brute": MOYEN,
  Baies: PETIT,
  Gibier: MOYEN,
  "Plante médicinale": PETIT,
  "Pièces mécaniques": PETIT,
  "Ingrédient de remède": PETIT,
  Munitions: PETIT,
  // Loot rare
  Radio: 0, // equipement : ne prend pas de place
  "Médicament basique": PETIT,
  "Arme simple": MOYEN,
  "Arme avancée": LOURD,
  "Arme à feu cassée": MOYEN,
  "Petit gibier": MOYEN,
  "Gros gibier": LOURD,
  "Gibier rare": LOURD,
  "Bois rare": MOYEN,
  "Minerai rare": PETIT,
  "Pièces mécaniques rouillées": PETIT,
  "Pièces pour voiture": LOURD,
  "Objet rare": MOYEN,
  // Craft simple
  Bandage: PETIT,
  "Plat préparé": MOYEN,
  Feu: MOYEN,
  "Arme de fortune": MOYEN,
  "Ration d'eau purifiée": PETIT,
  Torche: PETIT,
  "Piège simple": MOYEN,
  // Craft avance
  "Remède contre l'infection": PETIT,
  "Réparation voiture": LOURD,
  "Structures de défense avancées": LOURD,
  "Ragoût fortifiant": MOYEN,
  "Conserve longue durée": PETIT,
  "Infusion médicinale": PETIT,
  "Pièges avancés": LOURD,
  "Armes/outils avancés": LOURD,
  Festin: MOYEN,
  "Structure renforcée": LOURD,
  "Arme à feu": MOYEN,
};

export function poidsObjet(nom: string): number {
  return POIDS_OBJET[nom] ?? MOYEN;
}

export const CAPACITE_SAC = 20;
// Capacite de la banque de ville selon le palier de la place publique (0 = pas encore construite)
export const CAPACITE_BANQUE_PAR_PALIER = [50, 100, 200];

// Porter une radio donne le role Radio et l'acces au salon « ondes-radio » du groupe, en ville comme dehors
// (discord/joueurDiscord.ts)
export const OBJET_RADIO = "Radio";

// Equipements : objets portes sans prendre de place, montres a part dans l'image du sac (a cote des PA et de la charge)
const EQUIPEMENTS: readonly string[] = [OBJET_RADIO];

// Objet rare (equilibrage.md §5) : s'ouvre depuis /inventaire (1 PA) et donne l'un de ces lots, tire au hasard a
// chances egales
export const OBJET_RARE = "Objet rare";
export const COUT_OUVERTURE_OBJET_RARE = 1;
export const LOTS_OBJET_RARE: readonly { objet: string; quantite: number }[] = [
  { objet: OBJET_RADIO, quantite: 1 },
  { objet: "Arme avancée", quantite: 1 },
  { objet: "Médicament basique", quantite: 2 },
  { objet: "Remède contre l'infection", quantite: 1 },
  { objet: "Munitions", quantite: 3 },
];

// Festin du cuisinier (equilibrage.md §2 et §8) : servi en ville depuis le sac ou la banque, gratuit en PA, il rend
// de la faim a chaque citoyen vivant present en ville
export const OBJET_FESTIN = "Festin";
export const FAIM_FESTIN = 20;

export function estEquipement(nom: string): boolean {
  return EQUIPEMENTS.includes(nom);
}
