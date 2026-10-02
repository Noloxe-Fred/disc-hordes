import { TypeBatiment } from "@prisma/client";
import { PermissionFlagsBits, type AttachmentBuilder, type Guild, type Role, type TextChannel } from "discord.js";
import { prisma } from "../db";
import { synchroniserAccesJoueur } from "./joueurDiscord";
import {
  ensureCategory,
  ensureRole,
  ensureTextChannel,
  ensureVoiceChannel,
  supprimerRessources,
  trouverCategorie,
  trouverRole,
  trouverSalonTexte,
} from "./reconcile";
import { ROLE_MJ } from "./structure";

// Structure de la categorie "Ville" a la fondation (conception.md §1) : mairie, journal (flux public des actions en
// ville, poste par le bot : discord/journal.ts), place publique, chantiers, un salon "maisons privees" (un seul salon partage,
// la gestion par joueur se fait via Joueur.maisonPalier plutot que par salon dedie), et un
// salon vocal general lie au role-ville. La mairie est fermee : seules y paraissent les annonces
// de la ville (bot) et celles du maire (bouton « Annonce » de /action) ; les joueurs n'y ecrivent pas.
// Le puits n'a pas de salon : c'est un chantier. La categorie "Territoires externes" du groupe
// reste geree par territoires.ts.

// Ecriture retiree aux habitants dans la mairie et le journal (le MJ actif garde la main)
const ECRITURE_MAIRIE = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
];

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

  const lectureSeule = overwritesLectureSeule(guild, roleVille, roleMj);
  const salonMairie = await ensureTextChannel(guild, `salon:ville:${villeId}:mairie`, "mairie", categorie.id, lectureSeule);
  await ensureTextChannel(guild, `salon:ville:${villeId}:journal`, "journal", categorie.id, lectureSeule);
  await ensureTextChannel(guild, `salon:ville:${villeId}:place-publique`, "place-publique", categorie.id);
  await ensureTextChannel(guild, `salon:ville:${villeId}:chantiers`, "chantiers", categorie.id);
  await ensureTextChannel(guild, `salon:ville:${villeId}:maisons-privees`, "maisons-privées", categorie.id);
  await ensureVoiceChannel(guild, `salon:ville:${villeId}:vocal`, `Ville ${nomVille}`, categorie.id);

  return { roleVille, salonMairie };
}

// Salon lisible par les habitants sans qu'ils puissent y ecrire (mairie, journal)
function overwritesLectureSeule(guild: Guild, roleVille: Role, roleMj: Role | null) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, ...ECRITURE_MAIRIE] },
    { id: roleVille.id, allow: [PermissionFlagsBits.ViewChannel], deny: ECRITURE_MAIRIE },
    ...(roleMj ? [{ id: roleMj.id, allow: [PermissionFlagsBits.ViewChannel, ...ECRITURE_MAIRIE] }] : []),
  ];
}

// Salon « journal » d'une ville fondee avant sa mise en place (au demarrage du bot), puis acces des habitants recalcules
export async function ensureSalonJournal(guild: Guild, villeId: number): Promise<void> {
  const cle = `salon:ville:${villeId}:journal`;
  if (await trouverSalonTexte(guild, cle)) return;
  const categorie = await trouverCategorie(guild, `categorie:ville:${villeId}`);
  const roleVille = await trouverRole(guild, `role:ville:${villeId}`);
  if (!categorie || !roleVille) return;
  const roleMj = await trouverRole(guild, ROLE_MJ.cle);
  await ensureTextChannel(guild, cle, "journal", categorie.id, overwritesLectureSeule(guild, roleVille, roleMj));
  const habitants = await prisma.joueur.findMany({ where: { villeId, dateSortie: null }, select: { id: true } });
  for (const { id } of habitants) await synchroniserAccesJoueur(guild, id);
}

// Annonce publique dans la mairie d'une ville fondee (cycle jour/nuit, decisions du panneau /admin).
// "mentionnerVille" notifie tous les habitants via le role-ville (bascules jour/nuit, alerte d'attaque).
export async function posterDansMairie(
  guild: Guild,
  villeId: number,
  message: string,
  options: { mentionnerVille?: boolean; fichiers?: AttachmentBuilder[] } = {},
): Promise<void> {
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:mairie`);
  if (!salon) return;
  const roleVille = options.mentionnerVille ? await trouverRole(guild, `role:ville:${villeId}`) : null;
  await salon
    .send({
      content: roleVille ? `${roleVille} ${message}` : message,
      files: options.fichiers ?? [],
      allowedMentions: { parse: ["users"], roles: roleVille ? [roleVille.id] : [] },
    })
    .catch(() => null);
}

// Salon « atelier » : il n'existe que lorsque l'atelier de la ville est construit (palier 1 ou plus) ; c'est la que se
// fait le craft avance (/inventaire). Cree ou supprime selon le palier, puis acces des habitants recalcules.
export async function synchroniserSalonAtelier(guild: Guild, villeId: number): Promise<void> {
  const cle = `salon:ville:${villeId}:atelier`;
  const atelier = await prisma.batimentVille.findUnique({ where: { villeId_type: { villeId, type: TypeBatiment.ATELIER } } });
  if ((atelier?.palierActuel ?? 0) < 1) {
    await supprimerRessources(guild, [cle]);
    return;
  }
  if (await trouverSalonTexte(guild, cle)) return;
  const categorie = await trouverCategorie(guild, `categorie:ville:${villeId}`);
  if (!categorie) return;
  await ensureTextChannel(guild, cle, "atelier", categorie.id);
  const habitants = await prisma.joueur.findMany({ where: { villeId, dateSortie: null }, select: { id: true } });
  for (const { id } of habitants) await synchroniserAccesJoueur(guild, id);
}
