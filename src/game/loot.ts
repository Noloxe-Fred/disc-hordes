import type { TableLoot } from "../config/loot";

// Tirage d'une fouille (equilibrage.md §5) : nombre d'objets entre min et max, puis chaque objet tire
// independamment dans la table ; un tirage qui tombe hors des probabilites listees ne rapporte rien.
// Renvoie les noms des objets trouves dans l'ordre du tirage (un nom par objet), ordre dans lequel ils
// entrent dans le sac quand il n'y a pas de place pour tout.
export function tirerLoot(table: TableLoot, aleatoire: () => number = Math.random): string[] {
  const trouves: string[] = [];
  const nbObjets = table.min + Math.floor(aleatoire() * (table.max - table.min + 1));
  for (let i = 0; i < nbObjets; i++) {
    let tirage = aleatoire();
    const entree = table.tirages.find((t) => (tirage -= t.probabilite) < 0);
    if (entree) trouves.push(entree.objet);
  }
  return trouves;
}
