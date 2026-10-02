import { PermissionFlagsBits, type Guild } from "discord.js";
import { trouverRole } from "./reconcile";
import { ROLE_ADMIN, ROLE_MJ, ROLE_MJ_INACTIF } from "./structure";

// MJ actif ou Admin : acces a /mj et aux passe-droits du staff (fonder une ville sans minimum d'habitants).
// Un MJ inactif n'a pas plus de droits qu'un joueur.
export async function estMjOuAdmin(guild: Guild, userId: string): Promise<boolean> {
  return (await estAdmin(guild, userId)) || aUnDesRoles(guild, userId, [ROLE_MJ.cle]);
}

// Admin : porteur du role Admin, ou d'office tout membre ayant la permission Discord Administrateur (proprietaire du
// serveur compris), meme sans le role (base neuve, serveur pas encore initialise, role retire par erreur...).
export async function estAdmin(guild: Guild, userId: string): Promise<boolean> {
  const membre = await guild.members.fetch(userId).catch(() => null);
  if (!membre) return false;
  if (membre.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return aUnDesRoles(guild, userId, [ROLE_ADMIN.cle]);
}

// MJ actif : voit tout, et ne peut donc pas jouer
export async function estMjActif(guild: Guild, userId: string): Promise<boolean> {
  return aUnDesRoles(guild, userId, [ROLE_MJ.cle]);
}

export async function estMjInactif(guild: Guild, userId: string): Promise<boolean> {
  return aUnDesRoles(guild, userId, [ROLE_MJ_INACTIF.cle]);
}

export const MESSAGE_MJ_ACTIF_NE_JOUE_PAS =
  "🛡️ Vous êtes **MJ actif** : vous voyez tout le jeu, vous ne pouvez donc pas jouer. Passez en MJ inactif depuis `/mj` pour jouer.";

async function aUnDesRoles(guild: Guild, userId: string, cles: string[]): Promise<boolean> {
  const membre = await guild.members.fetch(userId).catch(() => null);
  if (!membre) return false;
  for (const cle of cles) {
    const role = await trouverRole(guild, cle);
    if (role && membre.roles.cache.has(role.id)) return true;
  }
  return false;
}
