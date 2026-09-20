import { Metier } from "@prisma/client";
import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../client";
import { NOM_METIER } from "../config/metiers";
import { prisma } from "../db";
import { trouverSalonTexte } from "../discord/reconcile";
import { SALON_FONDER_COLONIE } from "../discord/structure";
import { utilisateurEstEngage } from "../services/engagement";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

const CHOIX_METIER = Object.values(Metier).map((metier) => ({ name: NOM_METIER[metier], value: metier }));

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("creer-ville")
    .setDescription("Crée une nouvelle ville en cours de recrutement")
    .addStringOption((option) => option.setName("nom").setDescription("Nom de la ville").setRequired(true).setMaxLength(50))
    .addStringOption((option) =>
      option
        .setName("metier")
        .setDescription("Votre métier (par défaut : sans métier)")
        .setRequired(false)
        .addChoices(...CHOIX_METIER),
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
      return;
    }

    const nom = interaction.options.getString("nom", true).trim();
    const metier = interaction.options.getString("metier") as Metier | null;

    await interaction.deferReply({ ephemeral: true });

    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);

    if (await utilisateurEstEngage(utilisateur.id)) {
      await interaction.editReply("Vous êtes déjà engagé dans une ville (en jeu ou en cours de création).");
      return;
    }

    const ville = await prisma.ville.create({
      data: {
        nom,
        createurUtilisateurId: utilisateur.id,
        habitants: { create: { utilisateurId: utilisateur.id, metier: metier ?? undefined } },
      },
    });

    const salon = await trouverSalonTexte(guild, SALON_FONDER_COLONIE.cle);
    if (salon) {
      const message = await salon.send(
        `**${nom}** est en cours de création par ${interaction.user} !\n` +
          `Métier du fondateur : ${metier ? NOM_METIER[metier] : "sans métier"}\n` +
          "Utilisez `/rejoindre` pour la rejoindre.",
      );
      await prisma.ville.update({ where: { id: ville.id }, data: { messageAnnonceId: message.id } });
    }

    await interaction.editReply(
      `Ville **${nom}** créée${salon ? "" : " (le salon #fonder-une-colonie est introuvable, pensez à lancer /init)"}. ` +
        "Utilisez `/fonder-ville` quand vous êtes prêt à lancer la partie.",
    );
  },
};

export default command;
