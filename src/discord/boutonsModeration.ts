import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import { estMjOuAdmin } from "./permissions";
import { publierRegles } from "./publicationRegles";

// Panneau /moderation (Components V2) et ses boutons : customId "moderation:<action>", routes par boutons.ts.
// Les droits sont reverifies a chaque clic, le panneau pouvant rester affiche longtemps.

const COULEUR_MODERATION = 0xf1c40f; // or du role MJ

export function construirePanneauModeration(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COULEUR_MODERATION)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🛡️ Modération\n" +
          "**Publier les règles** : republie les règles joueurs à jour dans le salon règles " +
          "(les anciens messages du bot y sont supprimés).",
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("moderation:regles").setLabel("Publier les règles").setStyle(ButtonStyle.Primary),
      ),
    );
}

async function publierLesRegles(interaction: ButtonInteraction, guild: Guild) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply(await publierRegles(guild));
}

const ACTIONS = { regles: publierLesRegles } as const;

export async function gererBoutonModeration(interaction: ButtonInteraction, action: string) {
  const guild = interaction.guild;
  if (!guild || !(action in ACTIONS)) return;
  if (!(await estMjOuAdmin(guild, interaction.user.id))) {
    await interaction.reply({ content: "Action réservée aux MJ et aux Admins.", flags: MessageFlags.Ephemeral });
    return;
  }
  await ACTIONS[action as keyof typeof ACTIONS](interaction, guild);
}
