import type { TableLoot } from "../config/loot";

// Tirage d'une fouille (equilibrage.md §5) : nombre d'objets entre min et max, puis chaque objet tire
// independamment dans la table ; un tirage qui tombe hors des probabilites listees ne rapporte rien.
// Renvoie les quantites trouvees par nom d'objet.
export function tirerLoot(table: TableLoot, aleatoire: () => number = Math.random): Map<string, number> {
  const trouves = new Map<string, number>();
  const nbObjets = table.min + Math.floor(aleatoire() * (table.max - table.min + 1));
  for (let i = 0; i < nbObjets; i++) {
    let tirage = aleatoire();
    const entree = table.tirages.find((t) => (tirage -= t.probabilite) < 0);
    if (entree) trouves.set(entree.objet, (trouves.get(entree.objet) ?? 0) + 1);
  }
  return trouves;
}
