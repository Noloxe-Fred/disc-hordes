import { StatutJoueur, StatutVille, TypePhase } from "@prisma/client";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "../client";
import { NOM_METIER } from "../config/metiers";
import { LIBELLE_CAUSE_MORT } from "../config/mort";
import { PV_MAX } from "../config/sante";
import { prisma } from "../db";
import { calculerEtatInfection } from "../game/infection";
import { niveauJauge, type NiveauJauge } from "../game/faimSoif";
import { calculerPaMax } from "../game/pa";
import { prochaineBascule } from "../scheduler/cycle";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

function formatDureeHeures(heures: number): string {
  const h = Math.floor(heures);
  const m = Math.round((heures - h) * 60);
  return `${h}h${m.toString().padStart(2, "0")}`;
}

// Faim/soif sous le seuil d'alerte, sous le seuil critique (malus actifs) ou a 0
const ICONE_NIVEAU: Record<NiveauJauge, string> = { normal: "", alerte: " ⚠️", critique: " 🔴", vide: " ☠️" };

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
    const vivant = joueur.statut === StatutJoueur.VIVANT;
    const pa = calculerPaMax(joueur);
    // Detail des modificateurs de PA max, ex. "18 de base : blessures −15 %, faim −30 %"
    const detailPa =
      pa.modificateurs.length > 0
        ? `\n${pa.paMaxBase} de base : ` +
          pa.modificateurs
            .map((m) => `${m.libelle} ${m.fraction > 0 ? "+" : "−"}${Math.round(Math.abs(m.fraction) * 100)} %`)
            .join(", ")
        : "";

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username} — ${ville.nom}`)
      .setColor(!vivant ? 0xc0392b : ville.statut === StatutVille.ACTIVE ? 0x2ecc71 : 0x95a5a6)
      .addFields(
        { name: "Métier", value: joueur.metier ? NOM_METIER[joueur.metier] : "Sans métier", inline: true },
        { name: "PV", value: `${Math.max(0, joueur.pv)} / ${PV_MAX}`, inline: true },
        {
          name: "PA",
          value:
            joueur.paMax === null
              ? "à déterminer à la fondation"
              : `${joueur.paActuel} / ${pa.paMax}${detailPa}`,
          inline: true,
        },
        { name: "Faim", value: `${joueur.faim} / 100${ICONE_NIVEAU[niveauJauge(joueur.faim)]}`, inline: true },
        { name: "Soif", value: `${joueur.soif} / 100${ICONE_NIVEAU[niveauJauge(joueur.soif)]}`, inline: true },
        { name: "XP", value: `${joueur.xp}`, inline: true },
        { name: "Maison", value: joueur.maisonPalier > 0 ? `Palier ${joueur.maisonPalier} / 2` : "Pas encore de maison", inline: true },
        { name: "Position", value: joueur.zoneActuelle ? joueur.zoneActuelle.nom : "En ville", inline: true },
      );

    if (!vivant) {
      embed.setDescription(
        `💀 **Vous êtes mort**${joueur.causeMort ? ` (${LIBELLE_CAUSE_MORT[joueur.causeMort]})` : ""}. ` +
          "Vous voyez toujours votre ville mais ne pouvez plus y agir. Utilisez `/action` pour la quitter et en rejoindre une autre.",
      );
    }

    if (vivant && joueur.infecteDepuis) {
      const etat = calculerEtatInfection(joueur.infecteDepuis);
      embed.addFields({
        name: "Infection (visible de vous seul)",
        value: etat.zombifie
          ? "Transformation en cours — contactez un MJ."
          : `Malus PA actuel : −${etat.malusPaPourcent.toFixed(1)} %. Temps avant transformation : ${formatDureeHeures(etat.heuresRestantesAvantZombification)}.`,
      });
    }

    if (ville.statut === StatutVille.ACTIVE) {
      // Horloge commune : la phase change au prochain minuit, quelle que soit la date de fondation
      const bascule = Math.floor(prochaineBascule().getTime() / 1000);
      const prochainePhase = ville.phaseActuelle === TypePhase.JOUR ? "nuit" : "jour";
      embed.addFields({
        name: `Cycle ${ville.cycleActuel} — ${ville.phaseActuelle === TypePhase.JOUR ? "Jour" : "Nuit"}`,
        value:
          `Passage à la ${prochainePhase} <t:${bascule}:R> (à minuit)` +
          (ville.phaseActuelle === TypePhase.NUIT ? ", avec l'attaque des zombies." : "."),
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
