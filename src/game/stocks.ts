import type { PalierZone } from "@prisma/client";
import { estRessourceNaturelle, SEUIL_INDICE_STOCK, STOCK_FINI_DEPART, STOCK_NATUREL_MAX } from "../config/stocks";
import type { CleTypeZone } from "../config/zones";

// Stocks d'une zone (equilibrage.md §5), sans acces a la base

export interface StocksZone {
  naturel: number;
  fini: number;
}

export type CategorieStock = keyof StocksZone;

// Stocks actuels, une zone jamais fouillee etant pleine
export function stocksActuels(zone: { palier: PalierZone; stockNaturel: number | null; stockFini: number | null }): StocksZone {
  return { naturel: zone.stockNaturel ?? STOCK_NATUREL_MAX[zone.palier], fini: zone.stockFini ?? STOCK_FINI_DEPART[zone.palier] };
}

// Objets tires en fouille : chacun puise une unite dans son stock ; stock vide = rien. Renvoie les objets obtenus
// (dans l'ordre du tirage) et les stocks restants.
export function puiserDansLesStocks(tires: string[], typeZone: CleTypeZone, stocks: StocksZone) {
  const restants = { ...stocks };
  const obtenus: string[] = [];
  for (const nom of tires) {
    const categorie: CategorieStock = estRessourceNaturelle(nom, typeZone) ? "naturel" : "fini";
    if (restants[categorie] <= 0) continue;
    restants[categorie]--;
    obtenus.push(nom);
  }
  return { obtenus, restants };
}

// Indices affiches apres une fouille, sans chiffres
export function indicesStocks(palier: PalierZone, stocks: StocksZone): string[] {
  const indices: string[] = [];
  const naturelMax = STOCK_NATUREL_MAX[palier];
  const finiMax = STOCK_FINI_DEPART[palier];
  if (stocks.naturel <= 0) indices.push("🌲 Les ressources naturelles sont épuisées ici : il faudra attendre qu'elles repoussent.");
  else if (stocks.naturel < naturelMax * SEUIL_INDICE_STOCK) indices.push("🌲 Les ressources naturelles se font rares ici.");
  if (stocks.fini <= 0) indices.push("🏚️ Il n'y a plus rien à récupérer ici, à part ce qui repousse.");
  else if (stocks.fini < finiMax * SEUIL_INDICE_STOCK) indices.push("🏚️ La zone a été bien pillée.");
  return indices;
}
