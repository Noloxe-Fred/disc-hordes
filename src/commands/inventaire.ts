import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../client";
import { prisma } from "../db";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

// Affichage seul pour l'instant : le troc et le craft simple (conception.md §4) demandent
// des flux interactifs supplementaires (selection joueur/objet), a construire ensuite.
const command: Command = {
  data: new SlashCommandBuilder().setName("inventaire").setDescription("Affiche votre inventaire personnel"),

  async execute(interaction) {
    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);
    const joueur = await trouverJoueurActif(utilisateur.id);

    if (!joueur) {
      await interaction.reply({
        content: "Vous n'avez pas de personnage actif. Créez une ville avec `/creer-ville` ou rejoignez-en une depuis #fonder-une-colonie.",
        ephemeral: true,
      });
      return;
    }

    const inventaire = await prisma.inventaireJoueur.findMany({
      where: { joueurId: joueur.id, quantite: { gt: 0 } },
      include: { objet: true },
      orderBy: { objet: { nom: "asc" } },
    });

    const embed = new EmbedBuilder()
      .setTitle(`Inventaire — ${interaction.user.username}`)
      .setColor(0x95a5a6)
      .setDescription(
        inventaire.length > 0
          ? inventaire.map((entree) => `• ${entree.objet.nom} × ${entree.quantite}`).join("\n")
          : "Inventaire vide.",
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default command;
