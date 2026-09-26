import { TypeRessourceDiscord } from "@prisma/client";
import { ChannelType, type Guild, type GuildMember } from "discord.js";
import { prisma } from "../db";
import { trouverRole } from "./reconcile";
import { ROLE_CITOYEN, ROLE_MORT } from "./structure";

// Permissions retirees a un joueur mort sur les salons de sa ville : il les voit toujours
// (conception.md §3, l'ame reste liee a sa partie) mais ne peut plus y interagir.
const PERMISSIONS_RETIREES_MORT = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  AddReactions: false,
  Connect: false,
  Speak: false,
} as const;

async function salonsDeVille(guild: Guild, villeId: number) {
  const ressources = await prisma.ressourceDiscord.findMany({
    where: { guildId: guild.id, type: TypeRessourceDiscord.SALON, cle: { startsWith: `salon:ville:${villeId}:` } },
  });
  const salons = [];
  for (const { discordId } of ressources) {
    const salon = await guild.channels.fetch(discordId).catch(() => null);
    if (salon && (salon.type === ChannelType.GuildText || salon.type === ChannelType.GuildVoice)) salons.push(salon);
  }
  return salons;
}

async function retirerRole(membre: GuildMember, cle: string) {
  const role = await trouverRole(membre.guild, cle);
  if (role) await membre.roles.remove(role).catch(() => null);
}

// Mort d'un joueur : role Mort a la place de Citoyen, plus de position en territoire externe, et
// ecriture bloquee sur les salons de sa ville (permission propre au membre, prioritaire sur les roles).
export async function appliquerMortDiscord(
  guild: Guild,
  discordId: string,
  villeId: number,
  zoneActuelleId: number | null,
): Promise<void> {
  const membre = await guild.members.fetch(discordId).catch(() => null);
  if (!membre) return;

  const roleMort = await trouverRole(guild, ROLE_MORT.cle);
  if (roleMort) await membre.roles.add(roleMort).catch(() => null);
  await retirerRole(membre, ROLE_CITOYEN.cle);
  if (zoneActuelleId !== null) await retirerRole(membre, `role:position:zone:${zoneActuelleId}`);

  for (const salon of await salonsDeVille(guild, villeId)) {
    await salon.permissionOverwrites.edit(membre, PERMISSIONS_RETIREES_MORT).catch(() => null);
  }
}

// Depart de la ville (joueur mort qui quitte sa partie) : retrait des roles lies a la ville et des
// permissions propres posees a sa mort. Le role-ville retire lui enleve aussi la vue des salons.
export async function retirerJoueurDeVilleDiscord(guild: Guild, discordId: string, villeId: number): Promise<void> {
  const membre = await guild.members.fetch(discordId).catch(() => null);
  if (!membre) return;

  await retirerRole(membre, `role:ville:${villeId}`);
  await retirerRole(membre, ROLE_CITOYEN.cle);
  await retirerRole(membre, ROLE_MORT.cle);

  for (const salon of await salonsDeVille(guild, villeId)) {
    await salon.permissionOverwrites.delete(membre).catch(() => null);
  }
}
