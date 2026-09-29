import type { Guild } from "discord.js";
import { prisma } from "../db";
import { ajouterACarte } from "../services/carte";
import { changerPositionDiscord, synchroniserAccesJoueur } from "./joueurDiscord";

// Deplacement d'un joueur vers une zone de son groupe, ou en ville (null) : PA depenses, zone ajoutee a sa
// carte de decouverte, roles Position echanges, acces a la ville et aux ondes radio recalcules en sortant ou en
// rentrant (joueurDiscord.ts).
// Utilise par le bouton « aller » de /action et par « Teleporter » du panneau /admin (sans cout).
export async function deplacerJoueur(
  guild: Guild,
  joueur: { id: number; villeId: number | null; zoneActuelleId: number | null; utilisateur: { discordId: string } },
  zoneId: number | null,
  coutPa: number,
): Promise<void> {
  await prisma.joueur.update({
    where: { id: joueur.id },
    // Changer de lieu met fin a une rencontre de zombie en cours (fuite reussie, teleportation par un admin)
    data: {
      zoneActuelleId: zoneId,
      rencontrePvZombie: null,
      rencontreRetourZoneId: null,
      rencontreRetourVille: false,
      // Rentrer en ville remet a zero le risque accumule par les fouilles d'affilee
      ...(zoneId === null ? { fouillesSansRencontre: 0 } : {}),
      ...(coutPa > 0 ? { paActuel: { decrement: coutPa } } : {}),
    },
  });
  // Un citoyen transforme qu'il combattait reste sur place, sans cible (discord/zombieErrant.ts)
  await prisma.zombieErrant.updateMany({ where: { cibleId: joueur.id }, data: { cibleId: null } });
  if (zoneId !== null) await ajouterACarte(joueur.id, [zoneId]);

  await changerPositionDiscord(guild, joueur.utilisateur.discordId, joueur.zoneActuelleId, zoneId);
  const sortDeLaVille = joueur.zoneActuelleId === null && zoneId !== null;
  const rentreEnVille = joueur.zoneActuelleId !== null && zoneId === null;
  if (sortDeLaVille || rentreEnVille) await synchroniserAccesJoueur(guild, joueur.id);
}
