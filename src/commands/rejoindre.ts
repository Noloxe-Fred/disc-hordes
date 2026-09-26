import { Metier, StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { Command } from "../client";
import { NOM_METIER, PLACES_PAR_METIER, PLACES_SANS_METIER } from "../config/metiers";
import { prisma } from "../db";
import { trouverSalonTexte } from "../discord/reconcile";
import { SALON_NOUVEL_ARRIVANT } from "../discord/structure";
import { DELAI_FORMULAIRE_MS, LONGUEUR_MAX_TEXTE_LIBRE, enCitation } from "../discord/texteLibre";
import { utilisateurEstEngage } from "../services/engagement";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

const VALEUR_SANS_METIER = "AUCUN";
const DELAI_SELECTION_MS = 120_000;

const command: Command = {
  data: new SlashCommandBuilder().setName("rejoindre").setDescription("Rejoindre une ville en cours de création"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
      return;
    }

    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);

    if (await utilisateurEstEngage(utilisateur.id)) {
      await interaction.reply({
        content: "Vous êtes déjà engagé dans une ville, ou une de vos demandes est encore en attente.",
        ephemeral: true,
      });
      return;
    }

    const villes = await prisma.ville.findMany({
      where: { statut: StatutVille.EN_CREATION },
      include: { habitants: true, createur: true },
    });

    if (villes.length === 0) {
      await interaction.reply({
        content: "Aucune ville en cours de création pour le moment. Utilisez `/creer-ville`.",
        ephemeral: true,
      });
      return;
    }

    const menuVilles = new StringSelectMenuBuilder()
      .setCustomId("choix-ville")
      .setPlaceholder("Choisissez une ville")
      .addOptions(
        villes.map((v) => ({
          label: v.nom,
          value: String(v.id),
          description: `${v.habitants.length} membre(s) inscrit(s)`,
        })),
      );

    const reponse = await interaction.reply({
      content: "Quelle ville souhaitez-vous rejoindre ?",
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menuVilles)],
      ephemeral: true,
    });

    const selectionVille = await reponse
      .awaitMessageComponent({ componentType: ComponentType.StringSelect, time: DELAI_SELECTION_MS })
      .catch(() => null);

    if (!selectionVille) {
      await interaction.editReply({ content: "Délai dépassé, demande annulée.", components: [] });
      return;
    }

    const villeId = Number(selectionVille.values[0]);
    const ville = villes.find((v) => v.id === villeId);
    if (!ville) {
      await selectionVille.update({ content: "Cette ville n'existe plus.", components: [] });
      return;
    }

    const occupation = new Map<Metier, number>();
    for (const habitant of ville.habitants) {
      if (habitant.metier) occupation.set(habitant.metier, (occupation.get(habitant.metier) ?? 0) + 1);
    }
    const sansMetierPris = ville.habitants.filter((h) => !h.metier).length;

    const optionsMetier = [
      ...(sansMetierPris < PLACES_SANS_METIER ? [{ label: "Simple citoyen (sans métier)", value: VALEUR_SANS_METIER }] : []),
      ...Object.values(Metier)
        .filter((m) => (occupation.get(m) ?? 0) < PLACES_PAR_METIER[m])
        .map((m) => ({ label: NOM_METIER[m], value: m })),
    ];

    if (optionsMetier.length === 0) {
      await selectionVille.update({
        content: `**${ville.nom}** est complète (tous les métiers et places libres sont pris).`,
        components: [],
      });
      return;
    }

    const menuMetier = new StringSelectMenuBuilder()
      .setCustomId("choix-metier")
      .setPlaceholder("Choisissez un métier")
      .addOptions(optionsMetier);

    await selectionVille.update({
      content: `Ville choisie : **${ville.nom}**. Choisissez votre métier :`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menuMetier)],
    });

    const selectionMetier = await reponse
      .awaitMessageComponent({ componentType: ComponentType.StringSelect, time: DELAI_SELECTION_MS })
      .catch(() => null);

    if (!selectionMetier) {
      await interaction.editReply({ content: "Délai dépassé, demande annulée.", components: [] });
      return;
    }

    const metierChoisi = selectionMetier.values[0] === VALEUR_SANS_METIER ? null : (selectionMetier.values[0] as Metier);

    // Formulaire des motivations (facultatif), ouvert directement depuis le choix du metier
    const idFormulaire = `motivation:${selectionMetier.id}`;
    await selectionMetier.showModal(
      new ModalBuilder()
        .setCustomId(idFormulaire)
        .setTitle(`Rejoindre ${ville.nom}`.slice(0, 45))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("motivation")
              .setLabel("Vos motivations")
              .setPlaceholder("Pourquoi cette ville ? Votre style de jeu, vos disponibilités... (facultatif)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(LONGUEUR_MAX_TEXTE_LIBRE),
          ),
        ),
    );

    const soumission = await selectionMetier
      .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
      .catch(() => null);

    if (!soumission) {
      await interaction.editReply({ content: "Formulaire non envoyé, demande annulée.", components: [] }).catch(() => null);
      return;
    }

    const motivation = soumission.fields.getTextInputValue("motivation").trim() || null;

    // Reverifications : la saisie peut durer plusieurs minutes
    const villeActuelle = await prisma.ville.findUnique({ where: { id: ville.id } });
    if (villeActuelle?.statut !== StatutVille.EN_CREATION) {
      await soumission.reply({ content: `**${ville.nom}** n'accepte plus d'inscriptions.`, ephemeral: true });
      await interaction.editReply({ components: [] }).catch(() => null);
      return;
    }
    if (await utilisateurEstEngage(utilisateur.id)) {
      await soumission.reply({
        content: "Vous êtes déjà engagé dans une ville, ou une de vos demandes est encore en attente.",
        ephemeral: true,
      });
      await interaction.editReply({ components: [] }).catch(() => null);
      return;
    }

    const demande = await prisma.demandeInscription.create({
      data: { villeId: ville.id, utilisateurId: utilisateur.id, metierDemande: metierChoisi ?? undefined, motivation },
    });

    const salon = await trouverSalonTexte(guild, SALON_NOUVEL_ARRIVANT.cle);
    if (salon) {
      const boutons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`demande:accepter:${demande.id}`).setLabel("Accepter").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`demande:refuser:${demande.id}`).setLabel("Refuser").setStyle(ButtonStyle.Danger),
      );
      const message = await salon.send({
        content:
          `<@${ville.createur.discordId}> — ${interaction.user} demande à rejoindre **${ville.nom}** ` +
          `(métier : ${metierChoisi ? NOM_METIER[metierChoisi] : "sans métier"}).` +
          (motivation ? `\n\n**Motivations :**\n${enCitation(motivation)}` : ""),
        components: [boutons],
        // Seuls le createur et le joueur sont notifies, quel que soit le contenu des motivations
        allowedMentions: { users: [ville.createur.discordId, interaction.user.id] },
      });
      await prisma.demandeInscription.update({ where: { id: demande.id }, data: { messageId: message.id } });
    }

    const confirmation = {
      content:
        `Demande envoyée pour rejoindre **${ville.nom}**. En attente de validation par le créateur ` +
        `(\`/annuler-demande\` pour annuler).${salon ? "" : " (Salon #nouvel-arrivant introuvable : un admin doit lancer /init.)"}`,
      components: [],
    };
    if (soumission.isFromMessage()) await soumission.update(confirmation);
    else await soumission.reply({ ...confirmation, ephemeral: true });
  },
};

export default command;
