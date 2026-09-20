import { ChannelType, type Guild, type OverwriteResolvable, type Role, type TextChannel } from "discord.js";
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

export async function ensureRole(guild: Guild, cle: string, nom: string): Promise<Role> {
  const discordId = await getDiscordId(guild.id, cle);
  if (discordId) {
    const role = await guild.roles.fetch(discordId).catch(() => null);
    if (role) return role;
  }

  const role = await guild.roles.create({ name: nom });
  await saveRessource(guild.id, cle, TypeRessourceDiscord.ROLE, role.id);
  return role;
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
