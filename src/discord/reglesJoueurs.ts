import { readFileSync } from "node:fs";
import { join } from "node:path";

// Texte des regles joueurs (docs/regles-joueurs.md), decoupe en sections pour publicationRegles.ts, et du message
// de bienvenue (docs/bienvenue.md, bienvenue.ts). Chemins valables depuis src/discord (dev) comme depuis dist/discord (build).
const CHEMIN_REGLES = join(__dirname, "..", "..", "docs", "regles-joueurs.md");
const CHEMIN_BIENVENUE = join(__dirname, "..", "..", "docs", "bienvenue.md");

function lireContenu(chemin: string): string {
  const brut = readFileSync(chemin, "utf8");
  const sansBom = brut.charCodeAt(0) === 0xfeff ? brut.slice(1) : brut; // BOM UTF-8 eventuel (editeurs Windows)
  return sansBom.replace(/<!--[\s\S]*?-->/g, ""); // commentaires destines aux editeurs du fichier
}

// Sections des regles : chaque titre "# " ouvre une section (publiee en image, voir renduRegles.ts)
function lireSections(chemin: string): string[] {
  return lireContenu(chemin)
    .split(/^(?=# )/m)
    .map((section) => section.trim())
    .filter((section) => section.startsWith("# "));
}

export function lireSectionsRegles(): string[] {
  return lireSections(CHEMIN_REGLES);
}

// Message de bienvenue : premiere section de docs/bienvenue.md, null si le fichier n'en a pas
export function lireSectionBienvenue(): string | null {
  return lireSections(CHEMIN_BIENVENUE)[0] ?? null;
}

// Titres "# " et "## " d'une section, dans l'ordre (niveau 1 = titre principal, 2 = sous-titre)
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
