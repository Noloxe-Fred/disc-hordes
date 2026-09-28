// Champs de texte libre saisis par les joueurs via formulaire (projet de ville, motivations).
// La longueur est bornee pour que le texte tienne, avec l'en-tete, dans un message Discord (2000 car.).
export const LONGUEUR_MAX_TEXTE_LIBRE = 1000;
export const LONGUEUR_MAX_NOM_VILLE = 50;

// Formulaire laisse ouvert assez longtemps pour rediger, sous les 15 min de validite d'une interaction
export const DELAI_FORMULAIRE_MS = 10 * 60_000;

// Citation Discord multi-ligne : a placer en fin de message, ">>> " cite tout ce qui suit
export function enCitation(texte: string): string {
  return `>>> ${texte}`;
}
