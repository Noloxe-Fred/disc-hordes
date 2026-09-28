import { ChannelType, type CategoryChannel, type Guild, type OverwriteResolvable, type Role, type TextChannel, type VoiceChannel } from "discord.js";
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
// "separe" : membres affiches a part dans la liste du serveur (hoist) ; non precise = on ne touche pas.
export async function ensureRole(
  guild: Guild,
  cle: string,
  nom: string,
  couleur?: number,
  separe?: boolean,
): Promise<Role> {
  const discordId = await getDiscordId(guild.id, cle);
  if (discordId) {
    const role = await guild.roles.fetch(discordId).catch(() => null);
    if (role) {
      if (role.name !== nom) await role.setName(nom);
      if (couleur !== undefined && role.colors.primaryColor !== couleur) await role.setColors({ primaryColor: couleur });
      if (separe !== undefined && role.hoist !== separe) await role.setHoist(separe);
      return role;
    }
  }

  const role = await guild.roles.create({
    name: nom,
    colors: couleur !== undefined ? { primaryColor: couleur } : undefined,
    hoist: separe,
  });
  await saveRessource(guild.id, cle, TypeRessourceDiscord.ROLE, role.id);
  return role;
}

// Sans effet si l'ancienne cle n'existe pas, ou si la nouvelle est deja prise (on garde alors la nouvelle).
export async function renommerCle(guildId: string, ancienneCle: string, nouvelleCle: string): Promise<void> {
  if (await getDiscordId(guildId, nouvelleCle)) return;
  await prisma.ressourceDiscord.updateMany({ where: { guildId, cle: ancienneCle }, data: { cle: nouvelleCle } });
}

export async function supprimerRole(guild: Guild, cle: string): Promise<void> {
  const discordId = await getDiscordId(guild.id, cle);
  if (!discordId) return;
  const role = await guild.roles.fetch(discordId).catch(() => null);
  if (role) await role.delete();
  await prisma.ressourceDiscord.delete({ where: { guildId_cle: { guildId: guild.id, cle } } });
}

// Supprime sur Discord puis en base toutes les ressources dont la cle est listee ou commence par
// un des prefixes. Salons d'abord, categories ensuite (une categorie non vide ne se supprime pas
// proprement), roles en dernier.
export async function supprimerRessources(guild: Guild, cles: string[], prefixes: string[] = []): Promise<void> {
  const ressources = await prisma.ressourceDiscord.findMany({
    where: {
      guildId: guild.id,
      OR: [{ cle: { in: cles } }, ...prefixes.map((prefixe) => ({ cle: { startsWith: prefixe } }))],
    },
  });

  const ordre: TypeRessourceDiscord[] = [
    TypeRessourceDiscord.SALON,
    TypeRessourceDiscord.CATEGORIE,
    TypeRessourceDiscord.ROLE,
  ];
  for (const type of ordre) {
    for (const ressource of ressources.filter((r) => r.type === type)) {
      const cible =
        type === TypeRessourceDiscord.ROLE
          ? await guild.roles.fetch(ressource.discordId).catch(() => null)
          : await guild.channels.fetch(ressource.discordId).catch(() => null);
      await cible?.delete().catch((error) => console.error(`Suppression de ${ressource.cle} impossible`, error));
      await prisma.ressourceDiscord.delete({ where: { id: ressource.id } });
    }
  }
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
      if (salon.parentId !== parentId) await salon.setParent(parentId, { lockPermissions: false });
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

export async function trouverCategorie(guild: Guild, cle: string): Promise<CategoryChannel | null> {
  const discordId = await getDiscordId(guild.id, cle);
  if (!discordId) return null;
  const categorie = await guild.channels.fetch(discordId).catch(() => null);
  return categorie && categorie.type === ChannelType.GuildCategory ? categorie : null;
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
      if (salon.parentId !== parentId) await salon.setParent(parentId, { lockPermissions: false });
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

// Renomme sur Discord la ressource (role, categorie ou salon) enregistree sous cette cle, si elle existe encore
export async function renommerRessource(guild: Guild, cle: string, nom: string): Promise<void> {
  const ressource = await prisma.ressourceDiscord.findUnique({ where: { guildId_cle: { guildId: guild.id, cle } } });
  if (!ressource) return;
  const cible =
    ressource.type === TypeRessourceDiscord.ROLE
      ? await guild.roles.fetch(ressource.discordId).catch(() => null)
      : await guild.channels.fetch(ressource.discordId).catch(() => null);
  if (cible && cible.name !== nom) await cible.setName(nom).catch((error) => console.error(`Renommage de ${cle} impossible`, error));
}
