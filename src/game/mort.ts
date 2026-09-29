import { CauseMort, StatutJoueur } from "@prisma/client";
import type { Guild } from "discord.js";
import { prisma } from "../db";
import { declarerChuteVille } from "../discord/chute";
import { appliquerMortDiscord } from "../discord/joueurDiscord";

// Point d'entree unique de la mort d'un joueur, appele a 0 PV (game/sante.ts) ou a la transformation
// en zombie. Le joueur mort voit toujours sa ville mais ne peut plus y interagir ; il peut la quitter
// depuis /action pour en rejoindre une autre. Quand plus aucun habitant de la ville n'est vivant, la
// ville tombe (conception.md §1). Renvoie true si la ville est tombee.
export async function enregistrerMort(guild: Guild, joueurId: number, cause: CauseMort): Promise<boolean> {
  const avant = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, select: { zoneActuelleId: true } });
  const joueur = await prisma.joueur.update({
    where: { id: joueurId },
    data: {
      statut: cause === CauseMort.INFECTION ? StatutJoueur.ZOMBIFIE : StatutJoueur.MORT,
      dateMort: new Date(),
      causeMort: cause,
      // Le corps et son sac restent sur place (discord/depouilles.ts)
      zoneMortId: avant.zoneActuelleId,
      zoneActuelleId: null,
      rencontrePvZombie: null,
      rencontreRetourZoneId: null,
      rencontreRetourVille: false,
    },
    include: { utilisateur: true },
  });
  // Un citoyen transforme qu'il combattait reste sur place, sans cible (discord/zombieErrant.ts)
  await prisma.zombieErrant.updateMany({ where: { cibleId: joueurId }, data: { cibleId: null } });
  if (joueur.villeId === null) return false;

  await appliquerMortDiscord(guild, joueur.id, avant.zoneActuelleId);

  const survivants = await prisma.joueur.count({
    where: { villeId: joueur.villeId, statut: StatutJoueur.VIVANT, dateSortie: null },
  });
  if (survivants > 0) return false;

  await declarerChuteVille(guild, joueur.villeId);
  return true;
}
