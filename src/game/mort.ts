import { CauseMort, StatutJoueur } from "@prisma/client";
import type { Guild } from "discord.js";
import { prisma } from "../db";
import { declarerChuteVille } from "../discord/chute";

// Point d'entree unique de la mort d'un joueur, a appeler par chaque mecanique qui tue (attaque
// de nuit, combat en territoire externe, faim/soif, infection). Quand plus aucun habitant de la
// ville n'est vivant, la ville tombe (conception.md §1). Renvoie true si la ville est tombee.
export async function enregistrerMort(guild: Guild, joueurId: number, cause: CauseMort): Promise<boolean> {
  const joueur = await prisma.joueur.update({
    where: { id: joueurId },
    data: {
      statut: cause === CauseMort.INFECTION ? StatutJoueur.ZOMBIFIE : StatutJoueur.MORT,
      dateMort: new Date(),
      causeMort: cause,
    },
  });
  if (joueur.villeId === null) return false;

  const survivants = await prisma.joueur.count({
    where: { villeId: joueur.villeId, statut: StatutJoueur.VIVANT, dateSortie: null },
  });
  if (survivants > 0) return false;

  await declarerChuteVille(guild, joueur.villeId);
  return true;
}
