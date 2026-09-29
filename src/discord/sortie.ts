import { StatutJoueur } from "@prisma/client";
import type { Guild } from "discord.js";
import { prisma } from "../db";
import { declarerChuteVille } from "./chute";
import { changerPositionDiscord, retirerJoueurDeVilleDiscord } from "./joueurDiscord";

// Depart definitif d'un joueur d'une ville en jeu : sortie volontaire (vivant, exclu ou mort, bouton de /action) ou
// retrait par un admin. Le personnage est clos (plus de retour possible dans cette ville), sa place de metier se
// libere, un maire perd son mandat, et le joueur redevient Nomade. Le sac reste avec le personnage clos. Si c'etait
// le dernier habitant vivant, la ville tombe. Renvoie true si la ville est tombee.
export async function sortirDeVille(guild: Guild, joueurId: number): Promise<boolean> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const ville = joueur.ville!;

  await prisma.$transaction([
    prisma.joueur.update({
      where: { id: joueurId },
      data: { dateSortie: new Date(), zoneActuelleId: null, rencontrePvZombie: null, rencontreRetourZoneId: null, rencontreRetourVille: false },
    }),
    ...(ville.maireId === joueurId ? [prisma.ville.update({ where: { id: ville.id }, data: { maireId: null, mandatFinCycle: null } })] : []),
  ]);
  await prisma.zombieErrant.updateMany({ where: { cibleId: joueurId }, data: { cibleId: null } });
  await changerPositionDiscord(guild, joueur.utilisateur.discordId, joueur.zoneActuelleId, null);
  await retirerJoueurDeVilleDiscord(guild, joueur.utilisateur.discordId, ville.id);

  if (joueur.statut !== StatutJoueur.VIVANT) return false;
  const survivants = await prisma.joueur.count({ where: { villeId: ville.id, statut: StatutJoueur.VIVANT, dateSortie: null } });
  if (survivants > 0) return false;
  await declarerChuteVille(guild, ville.id);
  return true;
}
