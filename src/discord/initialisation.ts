import { TypeRessourceDiscord } from "@prisma/client";
import { PermissionFlagsBits, type Guild, type OverwriteResolvable, type Role } from "discord.js";
import { prisma } from "../db";
import { synchroniserNomade } from "./joueurDiscord";
import { ensureCategory, ensureRole, ensureTextChannel, renommerCle, supprimerRole } from "./reconcile";
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
  SALON_NOUVEL_ARRIVANT,
  SALON_REGLES,
  SALON_SIGNALEMENTS,
} from "./structure";

// Initialisation du serveur (bouton « Initialiser le serveur » du panneau /admin) : met en place ou met a
// jour la structure fixe de structure.ts, sans dupliquer ni casser l'existant. Idempotente.

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

// Salons de jeu deja crees (villes, territoires, ondes radio) : vue donnee au MJ actif, pour les villes fondees avant
// l'ajout de cette regle (les nouvelles l'ont des leur creation). Renvoie le nombre de categories et salons touches.
const PREFIXES_SALONS_DE_JEU = ["categorie:ville:", "salon:ville:", "categorie:groupe:", "salon:zone:", "salon:groupe:"];

async function ouvrirJeuAuMjActif(guild: Guild, roleMj: Role): Promise<number> {
  const ressources = await prisma.ressourceDiscord.findMany({
    where: {
      guildId: guild.id,
      type: { in: [TypeRessourceDiscord.SALON, TypeRessourceDiscord.CATEGORIE] },
      OR: PREFIXES_SALONS_DE_JEU.map((prefixe) => ({ cle: { startsWith: prefixe } })),
    },
  });
  let touches = 0;
  for (const { discordId } of ressources) {
    const salon = await guild.channels.fetch(discordId).catch(() => null);
    if (!salon || !("permissionOverwrites" in salon)) continue;
    await salon.permissionOverwrites.edit(roleMj, { ViewChannel: true }).catch(() => null);
    touches++;
  }
  return touches;
}

// Renvoie le compte rendu a afficher a l'Admin
export async function initialiserServeur(guild: Guild): Promise<string> {
  for (const [ancienneCle, nouvelleCle] of CLES_RENOMMEES) {
    await renommerCle(guild.id, ancienneCle, nouvelleCle);
  }

  const roles: Record<string, Role> = {};
  for (const { cle, nom, couleur, separe } of ROLES_DESIRES) {
    roles[cle] = await ensureRole(guild, cle, nom, couleur, separe);
  }
  const staffPlace = await placerStaffEnHaut(guild, roles[ROLE_ADMIN.cle], roles[ROLE_MJ.cle]);
  for (const cle of ROLES_OBSOLETES) {
    await supprimerRole(guild, cle);
  }

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
    await ensureTextChannel(guild, SALON_FONDER_COLONIE.cle, SALON_FONDER_COLONIE.nom, categorieDiscHordes.id),
    await ensureTextChannel(guild, SALON_NOUVEL_ARRIVANT.cle, SALON_NOUVEL_ARRIVANT.nom, categorieDiscHordes.id, [
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

  const salonsDeJeu = await ouvrirJeuAuMjActif(guild, roles[ROLE_MJ.cle]);

  // Role Nomade sur les membres deja presents : donne a ceux sans ville en jeu, retire aux autres
  const membres = await guild.members.fetch();
  for (const membre of membres.values()) {
    await synchroniserNomade(membre);
  }

  return (
    "Structure Discord initialisée/mise à jour : rôles, catégorie Admin-MJ (signalements + discussion-mj + gestion) " +
    "et catégorie Disc'Hordes (général + annonces + règles + fonder-une-colonie + nouvel-arrivant + commémoration). " +
    `Rôle Nomade synchronisé sur ${membres.filter((m) => !m.user.bot).size} membre(s). ` +
    `MJ actif : vue ouverte sur ${salonsDeJeu} catégorie(s) et salon(s) de jeu.` +
    (staffPlace
      ? ""
      : "\n⚠️ Rôles Admin et MJ non placés en haut : glissez le rôle du bot tout en haut de la liste des rôles " +
        "(Paramètres du serveur → Rôles), puis relancez l'initialisation.")
  );
}
