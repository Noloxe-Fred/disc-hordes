import type { Guild } from "discord.js";
import { prisma } from "../db";
import { ajouterACarte } from "../services/carte";
import { changerPositionDiscord, restreindreEcritureVille } from "./joueurDiscord";

// Deplacement d'un joueur vers une zone de son groupe, ou en ville (null) : PA depenses, zone ajoutee a sa
// carte de decouverte, roles Position echanges, ecriture en ville retiree dehors et rendue au retour.
// Utilise par le bouton « aller » de /action et par « Teleporter » du panneau /admin (sans cout).
export async function deplacerJoueur(
  guild: Guild,
  joueur: { id: number; villeId: number | null; zoneActuelleId: number | null; utilisateur: { discordId: string } },
  zoneId: number | null,
  coutPa: number,
): Promise<void> {
  await prisma.joueur.update({
    where: { id: joueur.id },
    data: { zoneActuelleId: zoneId, ...(coutPa > 0 ? { paActuel: { decrement: coutPa } } : {}) },
  });
  if (zoneId !== null) await ajouterACarte(joueur.id, [zoneId]);

  const discordId = joueur.utilisateur.discordId;
  await changerPositionDiscord(guild, discordId, joueur.zoneActuelleId, zoneId);
  const sortDeLaVille = joueur.zoneActuelleId === null && zoneId !== null;
  const rentreEnVille = joueur.zoneActuelleId !== null && zoneId === null;
  if (joueur.villeId !== null && (sortDeLaVille || rentreEnVille)) {
    await restreindreEcritureVille(guild, discordId, joueur.villeId, sortDeLaVille);
  }
}
