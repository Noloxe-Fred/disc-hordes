import { StatutJoueur } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import type { Command } from "../client";
import { LIBELLE_CAUSE_MORT } from "../config/mort";
import { prisma } from "../db";
import { retirerJoueurDeVilleDiscord } from "../discord/joueurDiscord";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

// Menu des actions du joueur (conception.md §4). Pour l'instant : un joueur mort peut quitter sa ville
// pour en rejoindre une autre ; les actions des vivants (deplacement, fouille, combat...) viendront ici.

const DELAI_CHOIX_MS = 120_000;
const COULEUR_VIVANT = 0x2ecc71;
const COULEUR_MORT = 0xc0392b;

const command: Command = {
  data: new SlashCommandBuilder().setName("action").setDescription("Affiche les actions possibles pour votre personnage"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);
    const joueur = await trouverJoueurActif(utilisateur.id);
    if (!joueur?.ville) {
      await interaction.reply({
        content: "Vous n'avez pas de personnage actif. Créez une ville avec `/creer-ville` ou rejoignez-en une depuis #fonder-une-colonie.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const ville = joueur.ville;

    if (joueur.statut === StatutJoueur.VIVANT) {
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(COULEUR_VIVANT)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## Actions — ${ville.nom}\nAucune action disponible pour l'instant : déplacement, fouille et combat arrivent bientôt.`,
              ),
            ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const conteneur = new ContainerBuilder()
      .setAccentColor(COULEUR_MORT)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 💀 Vous êtes mort\n` +
            `${joueur.causeMort ? `Vous avez été ${LIBELLE_CAUSE_MORT[joueur.causeMort]}. ` : ""}` +
            `Vous voyez toujours **${ville.nom}** mais ne pouvez plus y agir.\n` +
            "Vous pouvez quitter définitivement cette ville pour en rejoindre ou en créer une autre avec un nouveau personnage.",
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("quitter-ville").setLabel("Quitter la ville").setStyle(ButtonStyle.Danger),
        ),
      );

    const reponse = await interaction.reply({
      components: [conteneur],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });

    const clic = await reponse
      .awaitMessageComponent({ componentType: ComponentType.Button, time: DELAI_CHOIX_MS })
      .catch(() => null);
    if (!clic) return;

    // Collecte sur le message de reponse lui-meme : sur une reponse a un bouton, discord.js collecterait
    // sinon les clics du message portant ce bouton
    const confirmation = await clic.reply({
      content: `Quitter **${ville.nom}** ? Vous perdrez l'accès à ses salons, sans retour possible.`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("confirmer").setLabel("Confirmer").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("rester").setLabel("Rester").setStyle(ButtonStyle.Secondary),
        ),
      ],
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    });

    const choix =
      (await confirmation.resource?.message
        ?.awaitMessageComponent({ componentType: ComponentType.Button, time: DELAI_CHOIX_MS })
        .catch(() => null)) ?? null;
    if (choix?.customId !== "confirmer") {
      if (choix) await choix.update({ content: "Vous restez dans votre ville.", components: [] });
      return;
    }

    await prisma.joueur.update({ where: { id: joueur.id }, data: { dateSortie: new Date() } });
    await retirerJoueurDeVilleDiscord(guild, interaction.user.id, ville.id);

    await choix.update({
      content: `Vous avez quitté **${ville.nom}**. Vous pouvez rejoindre une ville depuis #fonder-une-colonie ou en créer une avec \`/creer-ville\`.`,
      components: [],
    });
  },
};

export default command;
