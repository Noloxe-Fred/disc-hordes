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
