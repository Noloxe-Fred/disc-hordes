import { ChannelType, type Guild, type OverwriteResolvable, type Role, type TextChannel, type VoiceChannel } from "discord.js";
import { TypeRessourceDiscord } from "@prisma/client";
import { prisma } from "../db";

async function getDiscordId(guildId: string, cle: string): Promise<string | undefined> {
  const ressource = await prisma.ressourceDiscord.findUnique({ where: { guildId_cle: { guildId, cle } } });
  return ressource?.discordId;
}

async function saveRessource(guildId: string, cle: string, type: TypeRessourceDiscord, discordId: string) {
  await prisma.ressourceDiscord.upsert({
    where: { guildId_cle: { guildId, cle } },
    update: { discordId, type },
    create: { guildId, cle, type, discordId },
  });
}

// Sans couleur, le role garde la couleur par defaut de Discord (et on ne touche pas a l'existant).
export async function ensureRole(guild: Guild, cle: string, nom: string, couleur?: number): Promise<Role> {
  const discordId = await getDiscordId(guild.id, cle);
  if (discordId) {
    const role = await guild.roles.fetch(discordId).catch(() => null);
    if (role) {
      if (couleur !== undefined && role.colors.primaryColor !== couleur) await role.setColors({ primaryColor: couleur });
      return role;
    }
  }

  const role = await guild.roles.create({
    name: nom,
    colors: couleur !== undefined ? { primaryColor: couleur } : undefined,
  });
  await saveRessource(guild.id, cle, TypeRessourceDiscord.ROLE, role.id);
  return role;
}

export async function supprimerRole(guild: Guild, cle: string): Promise<void> {
  const discordId = await getDiscordId(guild.id, cle);
  if (!discordId) return;
  const role = await guild.roles.fetch(discordId).catch(() => null);
  if (role) await role.delete();
  await prisma.ressourceDiscord.delete({ where: { guildId_cle: { guildId: guild.id, cle } } });
}

export async function ensureCategory(
  guild: Guild,
  cle: string,
  nom: string,
  overwrites: OverwriteResolvable[] = [],
) {
  const discordId = await getDiscordId(guild.id, cle);
  if (discordId) {
    const categorie = await guild.channels.fetch(discordId).catch(() => null);
    if (categorie && categorie.type === ChannelType.GuildCategory) {
      await categorie.permissionOverwrites.set(overwrites);
      return categorie;
    }
  }

  const categorie = await guild.channels.create({
    name: nom,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
  });
  await saveRessource(guild.id, cle, TypeRessourceDiscord.CATEGORIE, categorie.id);
  return categorie;
}

export async function ensureTextChannel(
  guild: Guild,
  cle: string,
  nom: string,
  parentId: string | null,
  overwrites: OverwriteResolvable[] = [],
): Promise<TextChannel> {
  const discordId = await getDiscordId(guild.id, cle);
  if (discordId) {
    const salon = await guild.channels.fetch(discordId).catch(() => null);
    if (salon && salon.type === ChannelType.GuildText) {
      await salon.permissionOverwrites.set(overwrites);
      if (salon.parentId !== parentId) await salon.setParent(parentId);
      return salon;
    }
  }

  const salon = await guild.channels.create({
    name: nom,
    type: ChannelType.GuildText,
    parent: parentId ?? undefined,
    permissionOverwrites: overwrites,
  });
  await saveRessource(guild.id, cle, TypeRessourceDiscord.SALON, salon.id);
  return salon;
}

export async function trouverRole(guild: Guild, cle: string): Promise<Role | null> {
  const discordId = await getDiscordId(guild.id, cle);
  if (!discordId) return null;
  return guild.roles.fetch(discordId).catch(() => null);
}

export async function trouverSalonTexte(guild: Guild, cle: string): Promise<TextChannel | null> {
  const discordId = await getDiscordId(guild.id, cle);
  if (!discordId) return null;
  const salon = await guild.channels.fetch(discordId).catch(() => null);
  return salon && salon.type === ChannelType.GuildText ? salon : null;
}

export async function ensureVoiceChannel(
  guild: Guild,
  cle: string,
  nom: string,
  parentId: string | null,
  overwrites: OverwriteResolvable[] = [],
): Promise<VoiceChannel> {
  const discordId = await getDiscordId(guild.id, cle);
  if (discordId) {
    const salon = await guild.channels.fetch(discordId).catch(() => null);
    if (salon && salon.type === ChannelType.GuildVoice) {
      await salon.permissionOverwrites.set(overwrites);
      if (salon.parentId !== parentId) await salon.setParent(parentId);
      return salon;
    }
  }

  const salon = await guild.channels.create({
    name: nom,
    type: ChannelType.GuildVoice,
    parent: parentId ?? undefined,
    permissionOverwrites: overwrites,
  });
  await saveRessource(guild.id, cle, TypeRessourceDiscord.SALON, salon.id);
  return salon;
}
