import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../client";
import { construirePanneauMj, construirePanneauMjInactif } from "../discord/boutonsAdmin";
import { estMjActif, estMjInactif, estMjOuAdmin } from "../discord/permissions";

// Panneau MJ (MJ actifs et Admins) : outils MJ (discord/boutonsMj.ts) et actions de jeu ouvertes aux MJ, par famille
// comme dans /admin (discord/boutonsAdmin.ts). Un MJ inactif n'y trouve que le bouton pour redevenir MJ actif.
const command: Command = {
  data: new SlashCommandBuilder().setName("mj").setDescription("Ouvre le panneau MJ (MJ/Admin)"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!(await estMjOuAdmin(guild, interaction.user.id))) {
      if (await estMjInactif(guild, interaction.user.id)) {
        await interaction.reply({ components: [construirePanneauMjInactif()], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: "Commande réservée aux MJ et aux Admins.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      components: [construirePanneauMj({ mjActif: await estMjActif(guild, interaction.user.id) })],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};

export default command;
