import { PermissionFlagsBits, SlashCommandBuilder, type OverwriteResolvable, type Role } from "discord.js";
import type { Command } from "../client";
import { ensureCategory, ensureRole, ensureTextChannel, supprimerRole } from "../discord/reconcile";
import {
  CATEGORIE_ADMIN_MJ,
  ROLES_DESIRES,
  SALON_DISCUSSION_MJ,
  ROLES_OBSOLETES,
  SALON_FONDER_COLONIE,
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

    const roles: Record<string, Role> = {};
    for (const { cle, nom, couleur } of ROLES_DESIRES) {
      roles[cle] = await ensureRole(guild, cle, nom, couleur);
    }
    for (const cle of ROLES_OBSOLETES) {
      await supprimerRole(guild, cle);
    }

    const mjAdminId = roles["role:mj-admin"].id;

    const overwritesAdminMJ: OverwriteResolvable[] = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: mjAdminId, allow: [PermissionFlagsBits.ViewChannel] },
    ];
    const categorieAdminMJ = await ensureCategory(guild, CATEGORIE_ADMIN_MJ.cle, CATEGORIE_ADMIN_MJ.nom, overwritesAdminMJ);

    await ensureTextChannel(guild, SALON_REGLES.cle, SALON_REGLES.nom, categorieAdminMJ.id, [
      { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
      { id: mjAdminId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ]);

    await ensureTextChannel(
      guild,
      SALON_SIGNALEMENTS.cle,
      SALON_SIGNALEMENTS.nom,
      categorieAdminMJ.id,
      overwritesAdminMJ,
    );

    await ensureTextChannel(
      guild,
      SALON_DISCUSSION_MJ.cle,
      SALON_DISCUSSION_MJ.nom,
      categorieAdminMJ.id,
      overwritesAdminMJ,
    );

    await ensureTextChannel(guild, SALON_FONDER_COLONIE.cle, SALON_FONDER_COLONIE.nom, null);

    await interaction.editReply(
      "Structure Discord initialisée/mise à jour : rôles, catégorie Admin-MJ (règles + signalements + discussion-mj) et salon fonder-une-colonie.",
    );
  },
};

export default command;
