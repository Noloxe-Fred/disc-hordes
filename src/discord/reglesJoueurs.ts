import { readFileSync } from "node:fs";
import { join } from "node:path";

// Texte des regles joueurs (docs/regles-joueurs.md), decoupe en messages Discord pour publicationRegles.ts.
// Chemin valable depuis src/discord (dev) comme depuis dist/discord (build).
const CHEMIN_REGLES = join(__dirname, "..", "..", "docs", "regles-joueurs.md");
const SEPARATEUR = /^<!--\s*nouveau message\s*-->\s*$/m;
const LONGUEUR_MAX_MESSAGE = 2000;
const TRAIT_SEPARATION = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

export function lireMessagesRegles(): string[] {
  const brut = readFileSync(CHEMIN_REGLES, "utf8");
  const sansBom = brut.charCodeAt(0) === 0xfeff ? brut.slice(1) : brut; // BOM UTF-8 eventuel (editeurs Windows)
  const contenu = sansBom.replace(/^\s*<!--[\s\S]*?-->/, ""); // commentaire d'en-tete, destine aux editeurs du fichier

  const messages = contenu
    .split(SEPARATEUR)
    .map((bloc) => bloc.trim())
    .filter((bloc) => bloc.length > 0);

  // Trait de separation avant chaque categorie de regles (titre "# "), sauf la toute premiere :
  // Discord n'affiche pas les regles horizontales Markdown ("---").
  let premiereCategorie = true;
  const avecSeparateurs = messages.map((message) =>
    message.replace(/^# /gm, (titre) => {
      if (premiereCategorie) {
        premiereCategorie = false;
        return titre;
      }
      return `${TRAIT_SEPARATION}\n${titre}`;
    }),
  );

  const tropLong = avecSeparateurs.findIndex((m) => m.length > LONGUEUR_MAX_MESSAGE);
  if (tropLong !== -1) {
    throw new Error(
      `Le message ${tropLong + 1} des règles fait ${avecSeparateurs[tropLong].length} caractères (max ${LONGUEUR_MAX_MESSAGE}) : ` +
        "découpez-le avec un séparateur « nouveau message » dans docs/regles-joueurs.md.",
    );
  }
  return avecSeparateurs;
}

// Titres "# " et "## " d'un message, dans l'ordre (niveau 1 = titre principal, 2 = sous-titre)
export function extraireTitres(message: string): { niveau: 1 | 2; texte: string }[] {
  return message
    .split(/\r?\n/)
    .map((ligne) => /^(#{1,2}) (.+)$/.exec(ligne.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ niveau: m[1].length as 1 | 2, texte: m[2].trim() }));
}

// Sommaire : chaque titre renvoie (lien cliquable) au message qui le contient. Discord n'a pas
// d'ancre a l'interieur d'un message : le lien mene au debut du message concerne.
// Texte de la description d'un embed (limite 4096 caracteres, contre 2000 pour un message).
export function construireSommaire(messages: string[], liens: (string | null)[]): string {
  const lignes: string[] = [];
  messages.forEach((message, index) => {
    const lien = liens[index];
    for (const { niveau, texte } of extraireTitres(message)) {
      const libelle = lien ? `[${texte}](${lien})` : texte;
      lignes.push(niveau === 1 ? `**${libelle}**` : `- ${libelle}`);
    }
  });
  return lignes.join("\n");
}

// Remplace "#nom-du-salon" par une mention cliquable <#id> pour les salons connus
export function lierSalons(message: string, salons: Map<string, string>): string {
  let resultat = message;
  // Noms les plus longs d'abord, pour qu'un nom ne soit pas remplace a l'interieur d'un autre
  for (const [nom, id] of [...salons].sort(([a], [b]) => b.length - a.length)) {
    resultat = resultat.split(`#${nom}`).join(`<#${id}>`);
  }
  return resultat;
}
