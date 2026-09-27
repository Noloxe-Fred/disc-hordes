import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../client";
import { construirePanneauAdmin } from "../discord/boutonsAdmin";
import { estAdmin } from "../discord/permissions";

// Panneau d'administration (Admin uniquement) : chaque action est un bouton, gere par discord/boutonsAdmin.ts
const command: Command = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Ouvre le panneau d'administration (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!(await estAdmin(guild, interaction.user.id))) {
      await interaction.reply({ content: "Commande réservée aux Admins.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      components: [construirePanneauAdmin()],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};

export default command;
