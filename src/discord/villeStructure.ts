import { PermissionFlagsBits, type Guild, type Role, type TextChannel } from "discord.js";
import { ensureCategory, ensureRole, ensureTextChannel, ensureVoiceChannel, trouverRole, trouverSalonTexte } from "./reconcile";
import { ROLE_MJ } from "./structure";

// Structure de la categorie "Ville" a la fondation (conception.md §1) : mairie, place
// publique, chantiers, atelier, puits, un salon "maisons privees" (un seul salon partage,
// la gestion par joueur se fait via Joueur.maisonPalier plutot que par salon dedie), et un
// salon vocal general lie au role-ville. La categorie "Territoires externes" du groupe reste
// geree par territoires.ts.

export interface StructureVille {
  roleVille: Role;
  salonMairie: TextChannel;
}

export async function creerStructureVille(guild: Guild, villeId: number, nomVille: string): Promise<StructureVille> {
  const roleVille = await ensureRole(guild, `role:ville:${villeId}`, `Ville:${nomVille}`);

  // Le MJ actif voit toutes les villes (structure.ts) ; les salons heritent des permissions de la categorie
  const roleMj = await trouverRole(guild, ROLE_MJ.cle);
  const overwritesVille = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roleVille.id, allow: [PermissionFlagsBits.ViewChannel] },
    ...(roleMj ? [{ id: roleMj.id, allow: [PermissionFlagsBits.ViewChannel] }] : []),
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

// Annonce publique dans la mairie d'une ville fondee (cycle jour/nuit, decisions du panneau /admin).
// "mentionnerVille" notifie tous les habitants via le role-ville (bascules jour/nuit, alerte d'attaque).
export async function posterDansMairie(
  guild: Guild,
  villeId: number,
  message: string,
  options: { mentionnerVille?: boolean } = {},
): Promise<void> {
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:mairie`);
  if (!salon) return;
  const roleVille = options.mentionnerVille ? await trouverRole(guild, `role:ville:${villeId}`) : null;
  await salon
    .send({
      content: roleVille ? `${roleVille} ${message}` : message,
      allowedMentions: { parse: ["users"], roles: roleVille ? [roleVille.id] : [] },
    })
    .catch(() => null);
}
