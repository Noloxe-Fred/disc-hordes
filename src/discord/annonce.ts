import { StatutJoueur, StatutVille } from "@prisma/client";
import {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import { prisma } from "../db";
import { posterDansMairie } from "./villeStructure";

// Annonce du maire (bouton « Annonce » de /action) : la mairie etant fermee aux joueurs, le maire y publie par le bot,
// en choisissant de notifier ou non toute la ville (role-ville). Inscrite au journal public de la ville.

const DELAI_FORMULAIRE_MS = 300_000;
const LONGUEUR_MAX_ANNONCE = 1800;

// Seul le maire vivant d'une ville en jeu peut annoncer
export function estMaireEnExercice(joueur: {
  id: number;
  statut: StatutJoueur;
  ville: { statut: StatutVille; maireId: number | null } | null;
}): boolean {
  return joueur.statut === StatutJoueur.VIVANT && joueur.ville?.statut === StatutVille.ACTIVE && joueur.ville.maireId === joueur.id;
}

// Formulaire (texte + notification), puis publication. Renvoie null si le formulaire n'est pas envoye.
export async function formulaireAnnonce(
  clic: ButtonInteraction,
  joueurId: number,
): Promise<{ soumission: ModalSubmitInteraction; texte: string } | null> {
  const idFormulaire = `annonce:${clic.id}`;
  await clic.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle("Annonce du maire")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Annonce")
          .setDescription("Publiée dans la mairie, où les citoyens ne peuvent pas écrire")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("texte")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(LONGUEUR_MAX_ANNONCE),
          ),
        new LabelBuilder().setLabel("Notifier toute la ville ?").setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("notifier")
            .setRequired(true)
            .addOptions(
              { label: "Oui, mentionner la ville", value: "oui", emoji: "🔔" },
              { label: "Non, sans notification", value: "non", emoji: "🔕", default: true },
            ),
        ),
      ),
  );
  const soumission = await clic
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return null;
  // Accuse reception tout de suite : le traitement peut depasser les 3 s laissees par Discord
  if (soumission.isFromMessage()) await soumission.deferUpdate();

  const texte = soumission.fields.getTextInputValue("texte").trim();
  const notifier = soumission.fields.getStringSelectValues("notifier")[0] === "oui";
  return { soumission, texte: await annoncer(clic.guild!, joueurId, texte, notifier) };
}

async function annoncer(guild: Guild, joueurId: number, texte: string, notifier: boolean): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  if (!estMaireEnExercice(joueur)) return "Vous n'êtes plus maire : l'annonce n'a pas été publiée.";
  if (texte === "") return "L'annonce est vide.";

  await posterDansMairie(guild, joueur.villeId!, `📢 **Annonce du maire** <@${joueur.utilisateur.discordId}>\n\n${texte}`, {
    mentionnerVille: notifier,
  });
  await prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: "Annonce du maire publiée dans la mairie" } });
  return `📢 Votre annonce est publiée dans la mairie${notifier ? ", avec une notification à toute la ville" : ""}.`;
}
