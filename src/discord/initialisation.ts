import { StatutVille } from "@prisma/client";
import { PermissionFlagsBits, type Collection, type Guild, type GuildMember, type OverwriteResolvable, type Role } from "discord.js";
import { prisma } from "../db";
import { synchroniserNomade } from "./joueurDiscord";
import { supprimerRestesDePartie } from "./nettoyage";
import { publierRegles } from "./publicationRegles";
import { ensureCategory, ensureRole, ensureTextChannel, supprimerRessources, tousLesMembres, trouverRole } from "./reconcile";
import {
  CATEGORIE_ADMIN_MJ,
  CATEGORIE_DISCHORDES,
  CLES_RENOMMEES,
  ROLE_ADMIN,
  ROLE_MJ,
  ROLE_MJ_INACTIF,
  ROLES_DESIRES,
  ROLES_OBSOLETES,
  SALON_ANNONCES,
  SALON_COMMEMORATION,
  SALON_DISCUSSION_MJ,
  SALON_FONDER_COLONIE,
  SALON_GENERAL,
  SALON_GESTION,
  SALON_ETRANGER_PORTES,
  SALON_NOUVEL_HABITANT,
  SALON_REGLES,
  SALON_SIGNALEMENTS,
  SALONS_OBSOLETES,
} from "./structure";

// Initialisation du serveur (bouton « Initialiser le serveur » du panneau /admin) : efface la structure fixe de
// structure.ts et la recree a neuf, pour repartir d'un etat sans reste d'anciennes versions. Refusee tant qu'une ville
// est en creation ou en jeu (il faut d'abord « Reinitialiser la base »).
// - Roles fixes supprimes puis recrees ; les roles du staff (Admin, MJ actif, MJ inactif) sont rendus a leurs membres.
// - Categories et salons fixes supprimes puis recrees, sauf les salons a historique (general, annonces,
//   nouvel-habitant, commemoration, discussion-mj, signalements), gardes mais dont les permissions sont entierement reecrites.
// - Restes de parties inconnus de la base supprimes (nettoyage.ts), regles republiees dans #regles.

// Salons fixes dont on garde les messages
const SALONS_CONSERVES = [SALON_GENERAL, SALON_ANNONCES, SALON_NOUVEL_HABITANT, SALON_COMMEMORATION, SALON_DISCUSSION_MJ, SALON_SIGNALEMENTS];
const SALONS_RECREES = [SALON_REGLES, SALON_FONDER_COLONIE, SALON_ETRANGER_PORTES, SALON_GESTION];
// Roles rendus a leurs membres apres recreation ; Citoyen, Mort et Radio n'ont pas de porteur hors partie, Nomade est
// recalcule
const ROLES_STAFF = [ROLE_ADMIN.cle, ROLE_MJ.cle, ROLE_MJ_INACTIF.cle];

// Admin puis MJ juste sous le role du bot (un bot ne peut pas placer un role au-dessus du sien).
// Renvoie false si le role du bot est trop bas dans la liste pour le faire.
async function placerStaffEnHaut(guild: Guild, roleAdmin: Role, roleMj: Role): Promise<boolean> {
  const positionBot = guild.members.me?.roles.highest.position ?? 0;
  if (positionBot < 3) return false;
  try {
    await guild.roles.setPositions([
      { role: roleAdmin, position: positionBot - 1 },
      { role: roleMj, position: positionBot - 2 },
    ]);
    return true;
  } catch (error) {
    console.error("Placement des roles Admin/MJ impossible", error);
    return false;
  }
}

// Porteurs actuels des roles du staff, par cle ; une ancienne cle renommee (structure.ts) compte pour la nouvelle
async function porteursStaff(guild: Guild): Promise<Map<string, string[]>> {
  const porteurs = new Map<string, string[]>();
  const sources: (readonly [string, string])[] = [...ROLES_STAFF.map((cle) => [cle, cle] as const), ...CLES_RENOMMEES];
  for (const [source, cible] of sources) {
    const role = await trouverRole(guild, source);
    if (!role) continue;
    porteurs.set(cible, [...(porteurs.get(cible) ?? []), ...role.members.map((m) => m.id)]);
  }
  return porteurs;
}

async function rendreRolesStaff(guild: Guild, porteurs: Map<string, string[]>): Promise<number> {
  let rendus = 0;
  for (const [cle, membres] of porteurs) {
    const role = await trouverRole(guild, cle);
    if (!role) continue;
    for (const id of new Set(membres)) {
      const membre = await guild.members.fetch(id).catch(() => null);
      if (membre && (await membre.roles.add(role).then(() => true).catch(() => false))) rendus++;
    }
  }
  return rendus;
}

// Renvoie le compte rendu a afficher a l'Admin
export async function initialiserServeur(guild: Guild): Promise<string> {
  const partiesEnCours = await prisma.ville.count({ where: { statut: { in: [StatutVille.EN_CREATION, StatutVille.ACTIVE] } } });
  if (partiesEnCours > 0) {
    return (
      `Initialisation refusée : ${partiesEnCours} ville(s) en création ou en jeu. ` +
      "Lancez d'abord « Réinitialiser la base » (famille Serveur), puis relancez l'initialisation."
    );
  }

  // Liste complete des membres, demandee une seule fois (Discord la limite) : porteurs du staff, puis role Nomade
  const membres = await tousLesMembres(guild);
  const porteurs = await porteursStaff(guild);
  let rendus = 0;
  try {
    await supprimerRessources(guild, [
      ...ROLES_DESIRES.map((r) => r.cle),
      ...ROLES_OBSOLETES,
      ...CLES_RENOMMEES.map(([ancienne]) => ancienne),
      CATEGORIE_ADMIN_MJ.cle,
      CATEGORIE_DISCHORDES.cle,
      ...SALONS_RECREES.map((s) => s.cle),
      ...SALONS_OBSOLETES,
    ]);
    const restes = await supprimerRestesDePartie(guild);
    return await creerStructure(guild, membres, restes);
  } finally {
    // Meme si la creation echoue en route : l'Admin ne doit pas perdre son role (/admin en depend)
    rendus = await rendreRolesStaff(guild, porteurs);
    console.log(`Initialisation : ${rendus} role(s) du staff rendu(s)`);
  }
}

async function creerStructure(
  guild: Guild,
  membres: Collection<string, GuildMember>,
  restes: { categories: number; roles: number },
): Promise<string> {
  const roles: Record<string, Role> = {};
  for (const { cle, nom, couleur, separe } of ROLES_DESIRES) {
    roles[cle] = await ensureRole(guild, cle, nom, couleur, separe);
  }
  const staffPlace = await placerStaffEnHaut(guild, roles[ROLE_ADMIN.cle], roles[ROLE_MJ.cle]);

  const everyoneId = guild.roles.everyone.id;
  const mjId = roles[ROLE_MJ.cle].id;
  const mjInactifId = roles[ROLE_MJ_INACTIF.cle].id;
  const adminId = roles[ROLE_ADMIN.cle].id;

  // Salons MJ : accessibles aux MJ actifs et aux Admins
  const overwritesMJ: OverwriteResolvable[] = [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: mjId, allow: [PermissionFlagsBits.ViewChannel] },
    { id: adminId, allow: [PermissionFlagsBits.ViewChannel] },
  ];
  // Categorie Admin-MJ et discussion-mj : aussi aux MJ inactifs, pour garder le contact avec l'equipe
  const overwritesEquipeMJ: OverwriteResolvable[] = [...overwritesMJ, { id: mjInactifId, allow: [PermissionFlagsBits.ViewChannel] }];
  // Salons Admin : accessibles aux Admins uniquement
  const overwritesAdmin: OverwriteResolvable[] = [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: adminId, allow: [PermissionFlagsBits.ViewChannel] },
  ];

  const categorieAdminMJ = await ensureCategory(guild, CATEGORIE_ADMIN_MJ.cle, CATEGORIE_ADMIN_MJ.nom, overwritesEquipeMJ);

  await ensureTextChannel(guild, SALON_SIGNALEMENTS.cle, SALON_SIGNALEMENTS.nom, categorieAdminMJ.id, overwritesMJ);
  await ensureTextChannel(guild, SALON_DISCUSSION_MJ.cle, SALON_DISCUSSION_MJ.nom, categorieAdminMJ.id, overwritesEquipeMJ);
  await ensureTextChannel(guild, SALON_GESTION.cle, SALON_GESTION.nom, categorieAdminMJ.id, overwritesAdmin);

  const categorieDiscHordes = await ensureCategory(guild, CATEGORIE_DISCHORDES.cle, CATEGORIE_DISCHORDES.nom);
  // Salons publics en lecture seule : seuls MJ et Admins (et le bot) y ecrivent
  const overwritesLectureSeule: OverwriteResolvable[] = [
    { id: everyoneId, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
    { id: mjId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    { id: adminId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];
  // Crees dans l'ordre d'affichage voulu, puis reordonnes (les salons deja existants gardent sinon leur place)
  const salonsDiscHordes = [
    await ensureTextChannel(guild, SALON_GENERAL.cle, SALON_GENERAL.nom, categorieDiscHordes.id),
    await ensureTextChannel(guild, SALON_ANNONCES.cle, SALON_ANNONCES.nom, categorieDiscHordes.id, overwritesLectureSeule),
    await ensureTextChannel(guild, SALON_REGLES.cle, SALON_REGLES.nom, categorieDiscHordes.id, overwritesLectureSeule),
    await ensureTextChannel(guild, SALON_NOUVEL_HABITANT.cle, SALON_NOUVEL_HABITANT.nom, categorieDiscHordes.id, overwritesLectureSeule),
    await ensureTextChannel(guild, SALON_FONDER_COLONIE.cle, SALON_FONDER_COLONIE.nom, categorieDiscHordes.id),
    await ensureTextChannel(guild, SALON_ETRANGER_PORTES.cle, SALON_ETRANGER_PORTES.nom, categorieDiscHordes.id, [
      { id: everyoneId, deny: [PermissionFlagsBits.SendMessages] },
    ]),
    await ensureTextChannel(guild, SALON_COMMEMORATION.cle, SALON_COMMEMORATION.nom, categorieDiscHordes.id, overwritesLectureSeule),
  ];
  await guild.channels.setPositions(salonsDiscHordes.map((channel, position) => ({ channel, position })));
  // Discord peut sortir un salon de sa categorie en le repositionnant, et refuse de changer la categorie de
  // plusieurs salons dans le meme appel : verification et rattachement salon par salon
  for (const salon of salonsDiscHordes) {
    const aJour = await guild.channels.fetch(salon.id, { force: true }).catch(() => null);
    if (aJour && "setParent" in aJour && aJour.parentId !== categorieDiscHordes.id) {
      await aJour.setParent(categorieDiscHordes.id, { lockPermissions: false });
    }
  }

  // Role Nomade sur les membres deja presents : donne a ceux sans ville en jeu, retire aux autres
  for (const membre of membres.values()) {
    await synchroniserNomade(membre);
  }

  return (
    "Structure Discord effacée puis recréée à neuf : rôles (staff rendu à ses membres), catégorie Admin-MJ (signalements + discussion-mj + gestion) " +
    "et catégorie Disc'Hordes (général + annonces + règles + nouvel-habitant + fonder-une-colonie + un-etranger-aux-portes + commémoration). " +
    `Rôle Nomade synchronisé sur ${membres.filter((m) => !m.user.bot).size} membre(s). ` +
    `${restes.categories} catégorie(s) et ${restes.roles} rôle(s) d'anciennes parties supprimés. ` +
    `Règles : ${await publierRegles(guild)}` +
    (staffPlace
      ? ""
      : "\n⚠️ Rôles Admin et MJ non placés en haut : glissez le rôle du bot tout en haut de la liste des rôles " +
        "(Paramètres du serveur → Rôles), puis relancez l'initialisation.")
  );
}
