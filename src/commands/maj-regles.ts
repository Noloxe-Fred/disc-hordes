import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../client";
import { estMjOuAdmin } from "../discord/permissions";
import { trouverSalonTexte } from "../discord/reconcile";
import { construireSommaire, lierSalons, lireMessagesRegles } from "../discord/reglesJoueurs";
import {
  SALON_ANNONCES,
  SALON_COMMEMORATION,
  SALON_FONDER_COLONIE,
  SALON_GENERAL,
  SALON_NOUVEL_ARRIVANT,
  SALON_REGLES,
} from "../discord/structure";

const COULEUR_SOMMAIRE = 0x2ecc71;

const SALONS_LIABLES = [
  SALON_GENERAL,
  SALON_ANNONCES,
  SALON_REGLES,
  SALON_FONDER_COLONIE,
  SALON_NOUVEL_ARRIVANT,
  SALON_COMMEMORATION,
];

// Republie les regles joueurs (docs/regles-joueurs.md) dans #regles : supprime les anciens messages
// du bot dans ce salon puis poste le contenu a jour. Reserve aux MJ et Admins.
const command: Command = {
  data: new SlashCommandBuilder()
    .setName("maj-règles")
    .setDescription("Republie les règles du jeu dans le salon règles (MJ/Admin)"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!(await estMjOuAdmin(guild, interaction.user.id))) {
      await interaction.reply({ content: "Commande réservée aux MJ et aux Admins.", flags: MessageFlags.Ephemeral });
      return;
    }

    const salonRegles = await trouverSalonTexte(guild, SALON_REGLES.cle);
    if (!salonRegles) {
      await interaction.reply({ content: "Salon règles introuvable : lancez d'abord `/init`.", flags: MessageFlags.Ephemeral });
      return;
    }

    let messages: string[];
    try {
      messages = lireMessagesRegles();
    } catch (error) {
      await interaction.reply({ content: `Règles non publiées : ${(error as Error).message}`, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Anciens messages du bot uniquement : un message ecrit a la main par un MJ/Admin est conserve
    const anciens = await salonRegles.messages.fetch({ limit: 100 });
    const aSupprimer = anciens.filter((m) => m.author.id === guild.client.user.id);
    for (const message of aSupprimer.values()) {
      await message.delete().catch(() => null);
    }

    const salons = new Map<string, string>();
    for (const { cle, nom } of SALONS_LIABLES) {
      const salon = await trouverSalonTexte(guild, cle);
      if (salon) salons.set(nom, salon.id);
    }

    // Sommaire poste en premier (sans liens), puis complete une fois les messages publies et leurs liens connus
    const embedSommaire = (liens: (string | null)[]) =>
      new EmbedBuilder()
        .setTitle("📖 Sommaire")
        .setColor(COULEUR_SOMMAIRE)
        .setDescription(construireSommaire(messages, liens))
        .setFooter({ text: "Cliquez sur un titre pour aller à la section." });
    const sommaire = await salonRegles.send({ embeds: [embedSommaire(messages.map(() => null))] });
    const liens: string[] = [];
    for (const message of messages) {
      const publie = await salonRegles.send({ content: lierSalons(message, salons), allowedMentions: { parse: [] } });
      liens.push(publie.url);
    }
    await sommaire.edit({ embeds: [embedSommaire(liens)] });

    await interaction.editReply(
      `Règles mises à jour dans ${salonRegles} : ${aSupprimer.size} ancien(s) message(s) supprimé(s), ` +
        `sommaire + ${messages.length} message(s) publié(s).`,
    );
  },
};

export default command;
