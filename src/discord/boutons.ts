import { StatutDemande } from "@prisma/client";
import type { ButtonInteraction } from "discord.js";
import { JOUEURS_MAX_PAR_VILLE, NOM_METIER, PLACES_PAR_METIER, PLACES_SANS_METIER } from "../config/metiers";
import { prisma } from "../db";
import { gererBoutonPanneau } from "./boutonsAdmin";
import { gererBoutonChantier } from "./chantiers";
import { gererBoutonAccueil } from "./accueil";
import { gererBoutonElection } from "./election";
import { gererBoutonSanction } from "./sanction";
import { gererBoutonOutilMj } from "./boutonsMj";
import { gererBoutonMaison } from "./maisons";
import { gererBoutonVille } from "./boutonsVille";
import { rafraichirMessageVille } from "./messageVille";

async function gererDemande(interaction: ButtonInteraction, action: "accepter" | "refuser", idBrut: string) {
  const demandeId = Number(idBrut);
  const demande = await prisma.demandeInscription.findUnique({
    where: { id: demandeId },
    include: { ville: { include: { createur: true, habitants: true } }, utilisateur: true },
  });

  if (!demande) {
    await interaction.reply({ content: "Cette demande n'existe plus.", ephemeral: true });
    return;
  }

  if (interaction.user.id !== demande.ville.createur.discordId) {
    await interaction.reply({ content: "Seul le créateur de la ville peut répondre à cette demande.", ephemeral: true });
    return;
  }

  if (demande.statut !== StatutDemande.EN_ATTENTE) {
    await interaction.reply({ content: "Cette demande a déjà été traitée.", ephemeral: true });
    return;
  }

  if (action === "refuser") {
    await prisma.demandeInscription.update({
      where: { id: demande.id },
      data: { statut: StatutDemande.REFUSEE, dateReponse: new Date() },
    });
    await interaction.update({
      content: `❌ Demande de <@${demande.utilisateur.discordId}> pour **${demande.ville.nom}** refusée.`,
      components: [],
    });
    return;
  }

  if (demande.ville.habitants.length >= JOUEURS_MAX_PAR_VILLE) {
    await interaction.reply({ content: `**${demande.ville.nom}** a déjà atteint ${JOUEURS_MAX_PAR_VILLE} habitants.`, ephemeral: true });
    return;
  }

  if (demande.metierDemande) {
    const occupees = demande.ville.habitants.filter((h) => h.metier === demande.metierDemande).length;
    if (occupees >= PLACES_PAR_METIER[demande.metierDemande]) {
      await interaction.reply({
        content: `Le métier ${NOM_METIER[demande.metierDemande]} est complet entre-temps ; refusez et invitez le joueur à refaire une demande.`,
        ephemeral: true,
      });
      return;
    }
  } else {
    const sansMetier = demande.ville.habitants.filter((h) => !h.metier).length;
    if (sansMetier >= PLACES_SANS_METIER) {
      await interaction.reply({ content: "Les places sans métier sont complètes entre-temps.", ephemeral: true });
      return;
    }
  }

  await prisma.$transaction([
    prisma.joueur.create({
      data: { utilisateurId: demande.utilisateurId, villeId: demande.villeId, metier: demande.metierDemande ?? undefined },
    }),
    prisma.demandeInscription.update({
      where: { id: demande.id },
      data: { statut: StatutDemande.ACCEPTEE, dateReponse: new Date() },
    }),
  ]);

  await interaction.update({
    content: `✅ <@${demande.utilisateur.discordId}> a rejoint **${demande.ville.nom}** !`,
    components: [],
  });

  if (interaction.guild) await rafraichirMessageVille(interaction.guild, demande.villeId);
}

export async function gererBouton(interaction: ButtonInteraction) {
  const [prefixe, action, id] = interaction.customId.split(":");
  if (!action) return;

  // Panneaux /admin et /mj : "<mode>:<famille>:<action>" ; outils propres a /mj : "mj:outils:<action>"
  if (prefixe === "mj" && action === "outils") {
    if (id) await gererBoutonOutilMj(interaction, id);
    return;
  }
  if (prefixe === "admin" || prefixe === "mj") {
    await gererBoutonPanneau(interaction, prefixe, action, id);
    return;
  }
  if (!id) return;

  if (prefixe === "demande" && (action === "accepter" || action === "refuser")) {
    await gererDemande(interaction, action, id);
  } else if (prefixe === "ville") {
    await gererBoutonVille(interaction, action, id);
  } else if (prefixe === "chantier") {
    await gererBoutonChantier(interaction, action, id);
  } else if (prefixe === "maison") {
    await gererBoutonMaison(interaction, action, id);
  } else if (prefixe === "election") {
    await gererBoutonElection(interaction, action, id);
  } else if (prefixe === "sanction") {
    await gererBoutonSanction(interaction, action, id);
  } else if (prefixe === "accueil") {
    await gererBoutonAccueil(interaction, action, id);
  }
}
