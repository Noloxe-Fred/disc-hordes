import type { Guild } from "discord.js";
import { trouverRole } from "./reconcile";
import { ROLE_ADMIN, ROLE_MJ } from "./structure";

export async function estMjOuAdmin(guild: Guild, userId: string): Promise<boolean> {
  return aUnDesRoles(guild, userId, [ROLE_MJ.cle, ROLE_ADMIN.cle]);
}

export async function estAdmin(guild: Guild, userId: string): Promise<boolean> {
  return aUnDesRoles(guild, userId, [ROLE_ADMIN.cle]);
}

async function aUnDesRoles(guild: Guild, userId: string, cles: string[]): Promise<boolean> {
  const membre = await guild.members.fetch(userId).catch(() => null);
  if (!membre) return false;
  for (const cle of cles) {
    const role = await trouverRole(guild, cle);
    if (role && membre.roles.cache.has(role.id)) return true;
  }
  return false;
}
