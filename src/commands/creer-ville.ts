import { Metier } from "@prisma/client";
import { ActionRowBuilder, ModalBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { Command } from "../client";
import { NOM_METIER } from "../config/metiers";
import { prisma } from "../db";
import { INCLUDE_MESSAGE_VILLE, construireMessageVille } from "../discord/messageVille";
import { trouverRole, trouverSalonTexte } from "../discord/reconcile";
import { ROLE_NOMADE, SALON_FONDER_COLONIE } from "../discord/structure";
import { DELAI_FORMULAIRE_MS, LONGUEUR_MAX_TEXTE_LIBRE } from "../discord/texteLibre";
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

    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);

    if (await utilisateurEstEngage(utilisateur.id)) {
      await interaction.reply({
        content: "Vous êtes déjà engagé dans une ville (en jeu ou en cours de création).",
        ephemeral: true,
      });
      return;
    }

    // Formulaire du projet de ville (facultatif) avant la creation
    const idFormulaire = `projet-ville:${interaction.id}`;
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(idFormulaire)
        .setTitle("Projet de ville")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("projet")
              .setLabel(`Présentez votre projet pour ${nom}`.slice(0, 45))
              .setPlaceholder("Ambiance, stratégie, rythme de jeu attendu... (facultatif)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(LONGUEUR_MAX_TEXTE_LIBRE),
          ),
        ),
    );

    const soumission = await interaction
      .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
      .catch(() => null);
    if (!soumission) return; // formulaire ferme ou delai depasse : rien n'est cree

    const projet = soumission.fields.getTextInputValue("projet").trim() || null;

    await soumission.deferReply({ ephemeral: true });

    // Reverification : une autre commande a pu engager le joueur pendant la saisie
    if (await utilisateurEstEngage(utilisateur.id)) {
      await soumission.editReply("Vous êtes déjà engagé dans une ville (en jeu ou en cours de création).");
      return;
    }

    const ville = await prisma.ville.create({
      data: {
        nom,
        projet,
        createurUtilisateurId: utilisateur.id,
        habitants: { create: { utilisateurId: utilisateur.id, metier: metier ?? undefined } },
      },
    });

    // Message de recrutement avec les boutons Rejoindre / Quitter / Fonder / Annuler
    const salon = await trouverSalonTexte(guild, SALON_FONDER_COLONIE.cle);
    if (salon) {
      const villeMessage = await prisma.ville.findUniqueOrThrow({ where: { id: ville.id }, include: INCLUDE_MESSAGE_VILLE });
      const roleNomade = await trouverRole(guild, ROLE_NOMADE.cle);
      const message = await salon.send(construireMessageVille(villeMessage, roleNomade?.id ?? null, true));
      await prisma.ville.update({ where: { id: ville.id }, data: { messageAnnonceId: message.id } });
    }

    await soumission.editReply(
      salon
        ? `Ville **${nom}** créée : ${salon}. Les demandes d'inscription arriveront dans #nouvel-arrivant ; ` +
            "utilisez le bouton « Fonder la ville » quand vous êtes prêt à lancer la partie."
        : `Ville **${nom}** créée, mais le salon #fonder-une-colonie est introuvable : un admin doit lancer /init.`,
    );
  },
};

export default command;
