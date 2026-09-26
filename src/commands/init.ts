import { PermissionFlagsBits, SlashCommandBuilder, type OverwriteResolvable, type Role } from "discord.js";
import type { Command } from "../client";
import { ensureCategory, ensureRole, ensureTextChannel, renommerCle, supprimerRole } from "../discord/reconcile";
import {
  CATEGORIE_ADMIN_MJ,
  CLES_RENOMMEES,
  ROLE_ADMIN,
  ROLE_MJ,
  ROLES_DESIRES,
  ROLES_OBSOLETES,
  SALON_DISCUSSION_MJ,
  SALON_FONDER_COLONIE,
  SALON_GESTION,
  SALON_REGLES,
  SALON_SIGNALEMENTS,
} from "../discord/structure";

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
    for (const { cle, nom, couleur } of ROLES_DESIRES) {
      roles[cle] = await ensureRole(guild, cle, nom, couleur);
    }
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

    await ensureTextChannel(guild, SALON_REGLES.cle, SALON_REGLES.nom, categorieAdminMJ.id, [
      { id: everyoneId, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
      { id: mjId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: adminId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ]);

    await ensureTextChannel(guild, SALON_SIGNALEMENTS.cle, SALON_SIGNALEMENTS.nom, categorieAdminMJ.id, overwritesMJ);
    await ensureTextChannel(guild, SALON_DISCUSSION_MJ.cle, SALON_DISCUSSION_MJ.nom, categorieAdminMJ.id, overwritesMJ);
    await ensureTextChannel(guild, SALON_GESTION.cle, SALON_GESTION.nom, categorieAdminMJ.id, overwritesAdmin);

    await ensureTextChannel(guild, SALON_FONDER_COLONIE.cle, SALON_FONDER_COLONIE.nom, null);

    await interaction.editReply(
      "Structure Discord initialisée/mise à jour : rôles, catégorie Admin-MJ (règles + signalements + discussion-mj + gestion) et salon fonder-une-colonie.",
    );
  },
};

export default command;
