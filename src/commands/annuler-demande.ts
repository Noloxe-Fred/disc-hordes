import { StatutDemande } from "@prisma/client";
import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../client";
import { prisma } from "../db";
import { trouverSalonTexte } from "../discord/reconcile";
import { SALON_FONDER_COLONIE } from "../discord/structure";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

const command: Command = {
  data: new SlashCommandBuilder().setName("annuler-demande").setDescription("Annule votre demande d'inscription en attente"),

  async execute(interaction) {
    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);

    const demande = await prisma.demandeInscription.findFirst({
      where: { utilisateurId: utilisateur.id, statut: StatutDemande.EN_ATTENTE },
      include: { ville: true },
    });

    if (!demande) {
      await interaction.reply({ content: "Vous n'avez aucune demande en attente.", ephemeral: true });
      return;
    }

    await prisma.demandeInscription.update({
      where: { id: demande.id },
      data: { statut: StatutDemande.ANNULEE, dateReponse: new Date() },
    });

    if (demande.messageId && interaction.guild) {
      const salon = await trouverSalonTexte(interaction.guild, SALON_FONDER_COLONIE.cle);
      const message = await salon?.messages.fetch(demande.messageId).catch(() => null);
      await message?.delete().catch(() => null);
    }

    await interaction.reply({ content: `Votre demande pour rejoindre **${demande.ville.nom}** a été annulée.`, ephemeral: true });
  },
};

export default command;
