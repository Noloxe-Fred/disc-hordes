import { StatutVille } from "@prisma/client";
import { prisma } from "../db";

// Le personnage courant d'un utilisateur : celui rattache a une ville EN_CREATION ou ACTIVE et qui
// ne l'a pas quittee (coherent avec la regle "un seul engagement a la fois" de services/engagement.ts).
// Un joueur mort reste son personnage courant tant qu'il n'a pas quitte sa ville via /action.
export function trouverJoueurActif(utilisateurId: number) {
  return prisma.joueur.findFirst({
    where: {
      utilisateurId,
      dateSortie: null,
      ville: { statut: { in: [StatutVille.EN_CREATION, StatutVille.ACTIVE] } },
    },
    include: { ville: true, zoneActuelle: true },
  });
}
