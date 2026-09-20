import { StatutJoueur, StatutVille } from "@prisma/client";
import { prisma } from "../db";

// Le personnage courant d'un utilisateur : celui rattache a une ville EN_CREATION ou ACTIVE
// (coherent avec la regle "un seul engagement a la fois" de services/engagement.ts). Un
// utilisateur peut avoir d'anciens Joueur (parties passees, morts) qui ne comptent pas ici.
export function trouverJoueurActif(utilisateurId: number) {
  return prisma.joueur.findFirst({
    where: {
      utilisateurId,
      statut: StatutJoueur.VIVANT,
      ville: { statut: { in: [StatutVille.EN_CREATION, StatutVille.ACTIVE] } },
    },
    include: { ville: true, zoneActuelle: true },
  });
}
