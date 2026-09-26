import { readFileSync } from "node:fs";
import { join } from "node:path";

// Texte des regles joueurs (docs/regles-joueurs.md), decoupe en messages Discord pour /maj-regles.
// Chemin valable depuis src/discord (dev) comme depuis dist/discord (build).
const CHEMIN_REGLES = join(__dirname, "..", "..", "docs", "regles-joueurs.md");
const SEPARATEUR = /^<!--\s*nouveau message\s*-->\s*$/m;
const LONGUEUR_MAX_MESSAGE = 2000;

export function lireMessagesRegles(): string[] {
  const contenu = readFileSync(CHEMIN_REGLES, "utf8")
    .replace(/^﻿/, "")
    .replace(/^\s*<!--[\s\S]*?-->/, ""); // commentaire d'en-tete, destine aux editeurs du fichier

  const messages = contenu
    .split(SEPARATEUR)
    .map((bloc) => bloc.trim())
    .filter((bloc) => bloc.length > 0);

  const tropLong = messages.findIndex((m) => m.length > LONGUEUR_MAX_MESSAGE);
  if (tropLong !== -1) {
    throw new Error(
      `Le message ${tropLong + 1} des règles fait ${messages[tropLong].length} caractères (max ${LONGUEUR_MAX_MESSAGE}) : ` +
        "découpez-le avec un séparateur « nouveau message » dans docs/regles-joueurs.md.",
    );
  }
  return messages;
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
