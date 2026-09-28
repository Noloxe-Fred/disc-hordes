import { PalierZone, StatutVille } from "@prisma/client";
import { ContainerBuilder, MessageFlags, SlashCommandBuilder, TextDisplayBuilder } from "discord.js";
import type { Command } from "../client";
import { grilleCarte } from "../services/carte";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

// Carte individuelle des zones decouvertes (conception.md §1 et §4) : zones visitees, observees depuis
// /action ou recues avec /partager-carte. Consultable a tout moment, y compris mort.

const LIBELLE_PALIER: Record<PalierZone, string> = {
  [PalierZone.PROCHE]: "Zones proches",
  [PalierZone.MOYENNE]: "Zones moyennes",
  [PalierZone.ELOIGNEE]: "Zones éloignées",
};

const command: Command = {
  data: new SlashCommandBuilder().setName("carte").setDescription("Affiche votre carte des zones découvertes"),

  async execute(interaction) {
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
    if (ville.statut !== StatutVille.ACTIVE || ville.groupeId === null) {
      await interaction.reply({
        content: `**${ville.nom}** n'est pas encore fondée : les territoires externes apparaîtront au lancement de la partie.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const grille = await grilleCarte(ville.groupeId, joueur.id, joueur.zoneActuelleId);
    const cases = grille.flatMap((ligne) => ligne.cases);
    const connues = cases.filter((c) => c.decouverte || c.ici).length;

    // Du plus loin au plus proche, la ville en bas, comme sur une carte vue depuis les remparts
    const lignes = [...grille]
      .reverse()
      .map(
        (ligne) =>
          `**${LIBELLE_PALIER[ligne.palier]}**\n` +
          ligne.cases.map((c) => `${c.ici ? "📍" : c.decouverte ? "🟢" : "⬛"} ${c.nomType}`).join(" · "),
      );
    const texte =
      `## 🗺️ Carte — ${ville.nom}\n` +
      `${connues} / ${cases.length} zones découvertes\n\n` +
      `${lignes.join("\n")}\n` +
      `${joueur.zoneActuelleId === null ? "📍" : "🏠"} **${ville.nom}**\n\n` +
      "-# 📍 vous êtes ici · 🟢 découverte · ⬛ inconnue — sur une même ligne, chaque zone touche ses voisines, et la dernière touche la première";

    await interaction.reply({
      components: [new ContainerBuilder().setAccentColor(0xc8a165).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte))],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};

export default command;
