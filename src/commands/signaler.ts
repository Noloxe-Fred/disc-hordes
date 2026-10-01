import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import type { Command } from "../client";
import { prisma } from "../db";
import { posterSignalement } from "../discord/signalement";
import { DELAI_FORMULAIRE_MS, LONGUEUR_MAX_TEXTE_LIBRE } from "../discord/texteLibre";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

// /signaler : formulaire (membre signale, facultatif, et message) poste dans #signalements pour l'equipe
function construireFormulaire(idFormulaire: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(idFormulaire)
    .setTitle("Signaler un comportement")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Membre signalé")
        .setDescription("Facultatif : laissez vide pour un problème général")
        .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId("cible").setRequired(false)),
      new LabelBuilder()
        .setLabel("Que s'est-il passé ?")
        .setDescription("Seuls les MJ et les Admins liront votre message")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("message")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(LONGUEUR_MAX_TEXTE_LIBRE),
        ),
    );
}

const command: Command = {
  data: new SlashCommandBuilder().setName("signaler").setDescription("Signale un comportement problématique à l'équipe"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    const idFormulaire = `signaler:${interaction.id}`;
    await interaction.showModal(construireFormulaire(idFormulaire));
    const soumission = await interaction
      .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
      .catch(() => null);
    if (!soumission) return;

    const cible = soumission.fields.getSelectedUsers("cible")?.first() ?? null;
    const message = soumission.fields.getTextInputValue("message").trim();
    await soumission.deferReply({ flags: MessageFlags.Ephemeral });

    if (!message) {
      await soumission.editReply("Le message ne peut pas être vide.");
      return;
    }
    if (cible?.id === interaction.user.id) {
      await soumission.editReply("Vous ne pouvez pas vous signaler vous-même.");
      return;
    }
    if (cible?.bot) {
      await soumission.editReply("Un bot ne peut pas être signalé : décrivez le problème sans choisir de membre.");
      return;
    }

    const signalant = await trouverOuCreerUtilisateur(interaction.user);
    const cibleUtilisateur = cible ? await trouverOuCreerUtilisateur(cible) : null;
    const signalement = await prisma.signalement.create({
      data: { signalantId: signalant.id, cibleId: cibleUtilisateur?.id ?? null, message, salonId: interaction.channelId },
    });

    if (!(await posterSignalement(guild, signalement.id))) {
      await soumission.editReply(
        "Signalement enregistré, mais le salon #signalements est introuvable : prévenez un Admin (le serveur doit être initialisé).",
      );
      return;
    }
    await soumission.editReply("🚩 Signalement transmis à l'équipe. Merci, il sera traité au plus vite.");
  },
};

export default command;
