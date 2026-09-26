import { PermissionFlagsBits, SlashCommandBuilder, type Guild, type OverwriteResolvable, type Role } from "discord.js";
import type { Command } from "../client";
import { synchroniserNomade } from "../discord/joueurDiscord";
import { ensureCategory, ensureRole, ensureTextChannel, renommerCle, supprimerRole } from "../discord/reconcile";
import {
  CATEGORIE_ADMIN_MJ,
  CATEGORIE_DISCHORDES,
  CLES_RENOMMEES,
  ROLE_ADMIN,
  ROLE_MJ,
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
} from "../discord/structure";

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

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("init")
    .setDescription("Met en place ou met a jour la structure Discord de Disc'Hordes")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

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
    const adminId = roles[ROLE_ADMIN.cle].id;

    // Salons MJ : accessibles aux MJ et aux Admins
    const overwritesMJ: OverwriteResolvable[] = [
      { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
      { id: mjId, allow: [PermissionFlagsBits.ViewChannel] },
      { id: adminId, allow: [PermissionFlagsBits.ViewChannel] },
    ];
    // Salons Admin : accessibles aux Admins uniquement
    const overwritesAdmin: OverwriteResolvable[] = [
      { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
      { id: adminId, allow: [PermissionFlagsBits.ViewChannel] },
    ];

    const categorieAdminMJ = await ensureCategory(guild, CATEGORIE_ADMIN_MJ.cle, CATEGORIE_ADMIN_MJ.nom, overwritesMJ);

    await ensureTextChannel(guild, SALON_SIGNALEMENTS.cle, SALON_SIGNALEMENTS.nom, categorieAdminMJ.id, overwritesMJ);
    await ensureTextChannel(guild, SALON_DISCUSSION_MJ.cle, SALON_DISCUSSION_MJ.nom, categorieAdminMJ.id, overwritesMJ);
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
      await ensureTextChannel(
        guild,
        SALON_COMMEMORATION.cle,
        SALON_COMMEMORATION.nom,
        categorieDiscHordes.id,
        overwritesLectureSeule,
      ),
    ];
    await guild.channels.setPositions(salonsDiscHordes.map((channel, position) => ({ channel, position })));

    // Role Nomade sur les membres deja presents : donne a ceux sans ville en jeu, retire aux autres
    const membres = await guild.members.fetch();
    for (const membre of membres.values()) {
      await synchroniserNomade(membre);
    }

    await interaction.editReply(
      "Structure Discord initialisée/mise à jour : rôles, catégorie Admin-MJ (signalements + discussion-mj + gestion) " +
        "et catégorie Disc'Hordes (général + fonder-une-colonie + nouvel-arrivant + annonces + règles + commémoration). " +
        `Rôle Nomade synchronisé sur ${membres.filter((m) => !m.user.bot).size} membre(s).` +
        (staffPlace
          ? ""
          : "\n⚠️ Rôles Admin et MJ non placés en haut : glissez le rôle du bot tout en haut de la liste des rôles " +
            "(Paramètres du serveur → Rôles), puis relancez /init."),
    );
  },
};

export default command;
