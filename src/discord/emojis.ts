import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Images Twemoji (paquet @twemoji/svg, licence CC-BY 4.0) des emojis, pour les rendus en image (regles, sac).

const DOSSIER_EMOJIS = join(__dirname, "..", "..", "node_modules", "@twemoji", "svg");

const IMAGE_VIDE = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>').toString("base64")}`;
const cacheEmojis = new Map<string, string>();

// Image d'un emoji en data URI SVG (image vide si Twemoji ne l'a pas). Nom de fichier Twemoji : points de code
// en hexadecimal joints par "-", sans le selecteur de variante FE0F (sauf dans les sequences ZWJ, ou certains
// fichiers le conservent)
export function imageEmoji(emoji: string): string {
  const enCache = cacheEmojis.get(emoji);
  if (enCache) return enCache;
  const codes = [...emoji].map((c) => c.codePointAt(0)!.toString(16));
  const candidats = [codes.filter((c) => c !== "fe0f").join("-"), codes.join("-")];
  const fichier = candidats.map((nom) => join(DOSSIER_EMOJIS, `${nom}.svg`)).find((chemin) => existsSync(chemin));
  const image = fichier ? `data:image/svg+xml;base64,${readFileSync(fichier).toString("base64")}` : IMAGE_VIDE;
  cacheEmojis.set(emoji, image);
  return image;
}
