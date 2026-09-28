import { ChannelType, type Guild } from "discord.js";
import { prisma } from "../db";

// Restes de parties inconnus de la base : categories de ville, categories « Territoires externes » et roles Ville: /
// Position: toujours presents sur Discord alors que la base ne les connait plus (base videe hors du bot, suppression
// interrompue...). Reconnus a leur forme, puisque leur cle n'existe plus : une categorie qui contient un salon
// « mairie » est une ville. Les ressources encore enregistrees en base (structure fixe) ne sont jamais touchees.
// A n'appeler que lorsqu'aucune partie n'est en jeu. Renvoie le nombre de categories et de roles supprimes.

const NOM_TERRITOIRES = "Territoires externes";
const PREFIXES_ROLES_PARTIE = ["Ville:", "Position:"];

export async function supprimerRestesDePartie(guild: Guild): Promise<{ categories: number; roles: number }> {
  const connus = new Set((await prisma.ressourceDiscord.findMany({ where: { guildId: guild.id } })).map((r) => r.discordId));
  const salons = await guild.channels.fetch();

  let categories = 0;
  for (const categorie of salons.values()) {
    if (categorie?.type !== ChannelType.GuildCategory || connus.has(categorie.id)) continue;
    const enfants = salons.filter((s) => s?.parentId === categorie.id);
    const estVille = enfants.some((s) => s?.type === ChannelType.GuildText && s.name === "mairie");
    if (!estVille && categorie.name !== NOM_TERRITOIRES) continue;
    for (const enfant of enfants.values()) {
      if (enfant && !connus.has(enfant.id)) await enfant.delete().catch((error) => console.error(`Suppression de #${enfant.name} impossible`, error));
    }
    await categorie.delete().catch((error) => console.error(`Suppression de la catégorie ${categorie.name} impossible`, error));
    categories++;
  }

  let roles = 0;
  for (const role of (await guild.roles.fetch()).values()) {
    if (connus.has(role.id) || role.managed || !PREFIXES_ROLES_PARTIE.some((p) => role.name.startsWith(p))) continue;
    await role.delete().catch((error) => console.error(`Suppression du rôle ${role.name} impossible`, error));
    roles++;
  }
  return { categories, roles };
}
