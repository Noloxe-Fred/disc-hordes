import { Metier } from "@prisma/client";
import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { Command } from "../client";
import { NOM_METIER } from "../config/metiers";
import { prisma } from "../db";
import { INCLUDE_MESSAGE_VILLE, construireMessageVille } from "../discord/messageVille";
import { trouverRole, trouverSalonTexte } from "../discord/reconcile";
import { ROLE_NOMADE, SALON_FONDER_COLONIE } from "../discord/structure";
import { DELAI_FORMULAIRE_MS, LONGUEUR_MAX_NOM_VILLE, LONGUEUR_MAX_TEXTE_LIBRE } from "../discord/texteLibre";
import { utilisateurEstEngage } from "../services/engagement";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

const VALEUR_SANS_METIER = "AUCUN";

// Formulaire unique de creation : nom, metier du createur et projet de ville (facultatif)
function construireFormulaire(idFormulaire: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(idFormulaire)
    .setTitle("Créer une ville")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Nom de la ville")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("nom")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(LONGUEUR_MAX_NOM_VILLE),
        ),
      new LabelBuilder()
        .setLabel("Votre métier")
        .setDescription("Le créateur est inscrit d'office dans sa ville")
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("metier")
            .setPlaceholder("Choisissez un métier")
            .setRequired(true)
            .addOptions(
              { label: "Simple citoyen (sans métier)", value: VALEUR_SANS_METIER },
              ...Object.values(Metier).map((metier) => ({ label: NOM_METIER[metier], value: metier })),
            ),
        ),
      new LabelBuilder()
        .setLabel("Projet de ville")
        .setDescription("Ambiance, stratégie, rythme de jeu attendu... (facultatif)")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("projet")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(LONGUEUR_MAX_TEXTE_LIBRE),
        ),
    );
}

const command: Command = {
  data: new SlashCommandBuilder().setName("creer-ville").setDescription("Crée une nouvelle ville en cours de recrutement"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);

    if (await utilisateurEstEngage(utilisateur.id)) {
      await interaction.reply({
        content: "Vous êtes déjà engagé dans une ville (en jeu ou en cours de création).",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const idFormulaire = `creer-ville:${interaction.id}`;
    await interaction.showModal(construireFormulaire(idFormulaire));

    const soumission = await interaction
      .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
      .catch(() => null);
    if (!soumission) return; // formulaire ferme ou delai depasse : rien n'est cree

    const nom = soumission.fields.getTextInputValue("nom").trim();
    const valeurMetier = soumission.fields.getStringSelectValues("metier")[0];
    const metier = valeurMetier === VALEUR_SANS_METIER ? null : (valeurMetier as Metier);
    const projet = soumission.fields.getTextInputValue("projet").trim() || null;

    await soumission.deferReply({ flags: MessageFlags.Ephemeral });

    if (!nom) {
      await soumission.editReply("Le nom de la ville ne peut pas être vide.");
      return;
    }

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
        : `Ville **${nom}** créée, mais le salon #fonder-une-colonie est introuvable : un Admin doit initialiser le serveur (panneau /admin).`,
    );
  },
};

export default command;
