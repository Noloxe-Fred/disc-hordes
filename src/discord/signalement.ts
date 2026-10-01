import { StatutJoueur } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import { prisma } from "../db";
import { trouverJoueurActif } from "../services/joueur";
import { estMjOuAdmin } from "./permissions";
import { trouverSalonTexte } from "./reconcile";
import { SALON_SIGNALEMENTS } from "./structure";
import { enCitation } from "./texteLibre";

// Signalements (conception.md §4) : /signaler poste une fiche dans #signalements (MJ actifs et Admins), avec un
// bouton « Marquer traité » qui la grise et note qui l'a traitee. Les mentions n'y notifient personne.

const COULEUR = 0xe67e22;
const COULEUR_TRAITE = 0x7f8c8d;

// Situation de jeu de la cible au moment du signalement, pour que l'equipe sache ou regarder
async function situation(utilisateurId: number): Promise<string> {
  const joueur = await trouverJoueurActif(utilisateurId);
  if (!joueur?.ville) return "nomade";
  const etat =
    joueur.statut === StatutJoueur.MORT
      ? "mort"
      : joueur.statut === StatutJoueur.EXCLU
        ? "exclu"
        : joueur.zoneActuelle
          ? `dehors (${joueur.zoneActuelle.nom})`
          : "en ville";
  return `${joueur.ville.nom}, ${etat}`;
}

async function construireFiche(signalementId: number): Promise<ContainerBuilder> {
  const s = await prisma.signalement.findUniqueOrThrow({
    where: { id: signalementId },
    include: { signalant: true, cible: true },
  });
  const date = `<t:${Math.floor(s.dateCreation.getTime() / 1000)}:f>`;
  const lignes = [
    `## 🚩 Signalement n°${s.id}`,
    `**Par** <@${s.signalant.discordId}> (${await situation(s.signalantId)})`,
    s.cible ? `**Contre** <@${s.cible.discordId}> (${await situation(s.cible.id)})` : "**Contre** personne en particulier",
    `**Le** ${date}${s.salonId ? `, depuis <#${s.salonId}>` : ""}`,
    s.traite ? `✅ **Traité**${s.traiteParDiscordId ? ` par <@${s.traiteParDiscordId}>` : ""}` : null,
    enCitation(s.message),
  ];
  const fiche = new ContainerBuilder()
    .setAccentColor(s.traite ? COULEUR_TRAITE : COULEUR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lignes.filter((l) => l !== null).join("\n")));
  if (s.traite) return fiche;
  return fiche.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`signalement:traiter:${s.id}`).setLabel("Marquer traité").setEmoji("✅").setStyle(ButtonStyle.Success),
    ),
  );
}

// Poste la fiche dans #signalements ; false si le salon est introuvable (serveur pas initialise)
export async function posterSignalement(guild: Guild, signalementId: number): Promise<boolean> {
  const salon = await trouverSalonTexte(guild, SALON_SIGNALEMENTS.cle);
  if (!salon) return false;
  const message = await salon.send({
    components: [await construireFiche(signalementId)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
  await prisma.signalement.update({ where: { id: signalementId }, data: { messageId: message.id } });
  return true;
}

export async function gererBoutonSignalement(interaction: ButtonInteraction, action: string, id: string): Promise<void> {
  if (action !== "traiter" || !interaction.guild) return;
  if (!(await estMjOuAdmin(interaction.guild, interaction.user.id))) {
    await interaction.reply({ content: "Réservé aux MJ actifs et aux Admins.", flags: MessageFlags.Ephemeral });
    return;
  }
  const signalementId = Number(id);
  const marque = await prisma.signalement.updateMany({
    where: { id: signalementId, traite: false },
    data: { traite: true, traiteParDiscordId: interaction.user.id },
  });
  if (marque.count === 0 && !(await prisma.signalement.findUnique({ where: { id: signalementId } }))) {
    await interaction.reply({ content: "Ce signalement n'existe plus.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.update({ components: [await construireFiche(signalementId)], allowedMentions: { parse: [] } });
}
