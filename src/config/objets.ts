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
  Radio: PETIT,
  "Médicament basique": PETIT,
  "Arme simple": MOYEN,
  "Arme avancée": LOURD,
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
};

export function poidsObjet(nom: string): number {
  return POIDS_OBJET[nom] ?? MOYEN;
}

export const CAPACITE_SAC = 12;
// Capacite de la banque de ville selon le palier de la place publique (0 = pas encore construite)
export const CAPACITE_BANQUE_PAR_PALIER = [40, 80, 160];
