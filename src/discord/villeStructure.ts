import { PermissionFlagsBits, type Guild, type Role, type TextChannel } from "discord.js";
import { ensureCategory, ensureRole, ensureTextChannel, ensureVoiceChannel } from "./reconcile";

// Structure de la categorie "Ville" a /fonder-ville (conception.md §1) : mairie, place
// publique, chantiers, atelier, puits, un salon "maisons privees" (un seul salon partage,
// la gestion par joueur se fait via Joueur.maisonPalier plutot que par salon dedie), et un
// salon vocal general lie au role-ville. La categorie "Territoires externes" du groupe reste
// hors scope ici (systeme d'exploration a construire plus tard).

export interface StructureVille {
  roleVille: Role;
  salonMairie: TextChannel;
}

export async function creerStructureVille(guild: Guild, villeId: number, nomVille: string): Promise<StructureVille> {
  const roleVille = await ensureRole(guild, `role:ville:${villeId}`, `Ville:${nomVille}`);

  const overwritesVille = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roleVille.id, allow: [PermissionFlagsBits.ViewChannel] },
  ];

  const categorie = await ensureCategory(guild, `categorie:ville:${villeId}`, nomVille, overwritesVille);

  const salonMairie = await ensureTextChannel(guild, `salon:ville:${villeId}:mairie`, "mairie", categorie.id);
  await ensureTextChannel(guild, `salon:ville:${villeId}:place-publique`, "place-publique", categorie.id);
  await ensureTextChannel(guild, `salon:ville:${villeId}:chantiers`, "chantiers", categorie.id);
  await ensureTextChannel(guild, `salon:ville:${villeId}:atelier`, "atelier", categorie.id);
  await ensureTextChannel(guild, `salon:ville:${villeId}:puits`, "puits", categorie.id);
  await ensureTextChannel(guild, `salon:ville:${villeId}:maisons-privees`, "maisons-privées", categorie.id);
  await ensureVoiceChannel(guild, `salon:ville:${villeId}:vocal`, `Ville ${nomVille}`, categorie.id);

  return { roleVille, salonMairie };
}
