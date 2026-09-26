import { StatutVille, TypePhase } from "@prisma/client";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../client";
import { DUREE_PHASE_HEURES } from "../config/cycle";
import { NOM_METIER } from "../config/metiers";
import { prisma } from "../db";
import { calculerEtatInfection } from "../game/infection";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

function formatDureeHeures(heures: number): string {
  const h = Math.floor(heures);
  const m = Math.round((heures - h) * 60);
  return `${h}h${m.toString().padStart(2, "0")}`;
}

const command: Command = {
  data: new SlashCommandBuilder().setName("personnage").setDescription("Affiche les statistiques de votre personnage"),

  async execute(interaction) {
    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);
    const joueur = await trouverJoueurActif(utilisateur.id);

    if (!joueur || !joueur.ville) {
      await interaction.reply({
        content: "Vous n'avez pas de personnage actif. Créez une ville avec `/creer-ville` ou rejoignez-en une depuis #fonder-une-colonie.",
        ephemeral: true,
      });
      return;
    }

    const ville = joueur.ville;

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username} — ${ville.nom}`)
      .setColor(ville.statut === StatutVille.ACTIVE ? 0x2ecc71 : 0x95a5a6)
      .addFields(
        { name: "Métier", value: joueur.metier ? NOM_METIER[joueur.metier] : "Sans métier", inline: true },
        {
          name: "PA",
          value: joueur.paMax !== null ? `${joueur.paActuel} / ${joueur.paMax}` : "à déterminer à la fondation",
          inline: true,
        },
        { name: "Blessures", value: `${joueur.blessures} / 3`, inline: true },
        { name: "Faim", value: `${joueur.faim} / 100`, inline: true },
        { name: "Soif", value: `${joueur.soif} / 100`, inline: true },
        { name: "XP", value: `${joueur.xp}`, inline: true },
        { name: "Maison", value: `Palier ${joueur.maisonPalier} / 2`, inline: true },
        { name: "Position", value: joueur.zoneActuelle ? joueur.zoneActuelle.nom : "En ville", inline: true },
      );

    if (joueur.infecteDepuis) {
      const etat = calculerEtatInfection(joueur.infecteDepuis);
      embed.addFields({
        name: "Infection (visible de vous seul)",
        value: etat.zombifie
          ? "Transformation en cours — contactez un MJ."
          : `Malus PA actuel : −${etat.malusPaPourcent.toFixed(1)} %. Temps avant transformation : ${formatDureeHeures(etat.heuresRestantesAvantZombification)}.`,
      });
    }

    if (ville.statut === StatutVille.ACTIVE && ville.phaseDepuis) {
      const heuresEcoulees = (Date.now() - ville.phaseDepuis.getTime()) / 3_600_000;
      const heuresRestantes = DUREE_PHASE_HEURES - heuresEcoulees;
      const prochainePhase = ville.phaseActuelle === TypePhase.JOUR ? "nuit" : "jour";
      embed.addFields({
        name: `Cycle ${ville.cycleActuel} — ${ville.phaseActuelle === TypePhase.JOUR ? "Jour" : "Nuit"}`,
        value:
          heuresRestantes > 0
            ? `Passage à la ${prochainePhase} dans environ ${formatDureeHeures(heuresRestantes)}.`
            : "Le changement de phase est en retard (avancement automatique du cycle pas encore implémenté).",
      });
    }

    const dernieresActions = await prisma.journalEntree.findMany({
      where: { joueurId: joueur.id },
      orderBy: { dateCreation: "desc" },
      take: 5,
    });

    embed.addFields({
      name: "Dernières actions",
      value:
        dernieresActions.length > 0
          ? dernieresActions.map((a) => `• ${a.message}`).join("\n")
          : "Aucune action enregistrée pour l'instant.",
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default command;
