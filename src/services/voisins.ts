import { StatutJoueur } from "@prisma/client";
import { prisma } from "../db";

// Survivants au meme endroit qu'un joueur (don, soin) : en ville, les citoyens vivants de sa ville presents en ville ;
// dehors, tout survivant (vivant ou exclu, quelle que soit sa ville) dans la meme zone. Limite a une liste Discord.
const VOISINS_MAX = 25;

export function survivantsAuMemeEndroit(
  joueur: { id: number; villeId: number | null; zoneActuelleId: number | null },
  max = VOISINS_MAX,
) {
  return prisma.joueur.findMany({
    where: {
      id: { not: joueur.id },
      dateSortie: null,
      ...(joueur.zoneActuelleId === null
        ? { villeId: joueur.villeId, zoneActuelleId: null, statut: StatutJoueur.VIVANT }
        : { zoneActuelleId: joueur.zoneActuelleId, statut: { in: [StatutJoueur.VIVANT, StatutJoueur.EXCLU] } }),
    },
    include: { utilisateur: true },
    orderBy: { id: "asc" },
    take: max,
  });
}
