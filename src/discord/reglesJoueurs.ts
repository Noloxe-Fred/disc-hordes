import { readFileSync } from "node:fs";
import { join } from "node:path";

// Texte des regles joueurs (docs/regles-joueurs.md), decoupe en sections pour publicationRegles.ts, et du message
// de bienvenue (docs/bienvenue.md, bienvenue.ts) et de l'accueil a la fondation d'une ville (docs/accueil-ville.md,
// accueilVille.ts). Chemins valables depuis src/discord (dev) comme depuis dist/discord (build).
const CHEMIN_REGLES = join(__dirname, "..", "..", "docs", "regles-joueurs.md");
const CHEMIN_BIENVENUE = join(__dirname, "..", "..", "docs", "bienvenue.md");
const CHEMIN_ACCUEIL_VILLE = join(__dirname, "..", "..", "docs", "accueil-ville.md");

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

// Une ligne "---" dans une section ouvre une nouvelle page (une image de plus) ; chaque page suivante reprend le
// titre "# " de la section pour son bandeau
export function decouperPages(section: string): string[] {
  const [titre] = section.split(/\r?\n/);
  return section
    .split(/^---[ \t]*$/m)
    .map((page) => page.trim())
    .filter(Boolean)
    .map((page, index) => (index === 0 ? page : `${titre}\n\n${page}`));
}

// Texte d'une section sans ses separateurs de pages (fil de texte sous le sommaire)
export function sansSeparateurs(section: string): string {
  return section.replace(/^---[ \t]*\r?\n?/gm, "").replace(/(\r?\n){3,}/g, "\n\n");
}

// Message de bienvenue : premiere section de docs/bienvenue.md, null si le fichier n'en a pas
export function lireSectionBienvenue(): string | null {
  return lireSections(CHEMIN_BIENVENUE)[0] ?? null;
}

// Message d'accueil a la fondation d'une ville : premiere section de docs/accueil-ville.md, null si le fichier n'en a pas
export function lireSectionAccueilVille(): string | null {
  return lireSections(CHEMIN_ACCUEIL_VILLE)[0] ?? null;
}

// Titres "# " et "## " d'une section, dans l'ordre (niveau 1 = titre principal, 2 = sous-titre)
export function extraireTitres(message: string): { niveau: 1 | 2; texte: string }[] {
  return message
    .split(/\r?\n/)
    .map((ligne) => /^(#{1,2}) (.+)$/.exec(ligne.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ niveau: m[1].length as 1 | 2, texte: m[2].trim() }));
}

// Sommaire : chaque titre de section renvoie (lien cliquable) au message qui la contient. Discord n'a pas
// d'ancre a l'interieur d'un message : un lien par sous-titre menerait au meme endroit, et ferait depasser la limite.
// Une page suivante d'une section (meme titre "# " que la precedente) n'est pas relistee : son premier sous-titre
// renvoie a son message. Texte de la description d'un embed (limite 4096 caracteres, contre 2000 pour un message).
export function construireSommaire(messages: string[], liens: (string | null)[]): string {
  const lignes: string[] = [];
  let titreSection: string | null = null;
  messages.forEach((message, index) => {
    const lien = liens[index];
    const lier = (texte: string) => (lien ? `[${texte}](${lien})` : texte);
    let suite = false;
    for (const { niveau, texte } of extraireTitres(message)) {
      if (niveau === 1) {
        suite = texte === titreSection;
        titreSection = texte;
        if (!suite) lignes.push(`**${lier(texte)}**`);
      } else {
        lignes.push(`- ${suite ? lier(texte) : texte}`);
        suite = false;
      }
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
