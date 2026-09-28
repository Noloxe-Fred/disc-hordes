import { StatutVille, type Prisma } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type Guild,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type RepliableInteraction,
  type User,
} from "discord.js";
import { prisma } from "../../db";
import { DELAI_FORMULAIRE_MS } from "../texteLibre";

// Outils communs aux actions du panneau /admin : description des familles, formulaires (modals) de ciblage,
// confirmation des actions destructives et journal des actions admin.
// Ciblage toujours par menu deroulant (conception.md §4), jamais par texte a taper.

export type ExecuteurAdmin = (interaction: ButtonInteraction, guild: Guild) => Promise<void>;

export interface ActionAdmin {
  cle: string;
  libelle: string;
  description: string;
  style?: ButtonStyle;
  // Absent : action prevue mais dont la mecanique de jeu n'existe pas encore (bouton grise)
  executer?: ExecuteurAdmin;
}

export interface FamilleAdmin {
  cle: string;
  titre: string;
  emoji: string;
  resume: string;
  actions: ActionAdmin[];
}

export const DELAI_CONFIRMATION_MS = 30_000;
export const DELAI_SELECTION_MS = 120_000;
// Une liste deroulante Discord propose au plus 25 options
const OPTIONS_MAX = 25;

export async function repondre(interaction: RepliableInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

// --- Journal des actions admin (table JournalAdmin, consultable depuis la famille Moderation) ---

export async function journaliser(admin: User, action: string, details: string): Promise<void> {
  await prisma.journalAdmin
    .create({ data: { adminDiscordId: admin.id, action, details } })
    .catch((error) => console.error("Journalisation d'une action admin impossible", error));
}

// --- Formulaires ---

export async function ouvrirFormulaire(
  interaction: ButtonInteraction,
  titre: string,
  champs: LabelBuilder[],
): Promise<ModalSubmitInteraction | null> {
  const idFormulaire = `admin-formulaire:${interaction.id}`;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle(titre.slice(0, 45))
      .addLabelComponents(...champs),
  );
  return interaction
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
}

export function champTexte(
  id: string,
  libelle: string,
  options: { requis?: boolean; max?: number; description?: string; exemple?: string } = {},
): LabelBuilder {
  const saisie = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(TextInputStyle.Short)
    .setRequired(options.requis ?? true);
  if (options.max) saisie.setMaxLength(options.max);
  if (options.exemple) saisie.setPlaceholder(options.exemple);
  const label = new LabelBuilder().setLabel(libelle).setTextInputComponent(saisie);
  if (options.description) label.setDescription(options.description);
  return label;
}

export function champChoix(
  id: string,
  libelle: string,
  options: { label: string; value: string; description?: string }[],
): LabelBuilder {
  return new LabelBuilder()
    .setLabel(libelle)
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder().setCustomId(id).setRequired(true).addOptions(options.slice(0, OPTIONS_MAX)),
    );
}

export function champMembre(libelle = "Joueur", id = "joueur"): LabelBuilder {
  return new LabelBuilder()
    .setLabel(libelle)
    .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId(id).setRequired(true));
}

const LIBELLE_STATUT_VILLE: Record<StatutVille, string> = {
  [StatutVille.EN_CREATION]: "en création",
  [StatutVille.ACTIVE]: "en jeu",
  [StatutVille.TOMBEE]: "tombée",
};

// Liste des villes aux statuts donnes (villes en jeu d'abord, puis les plus recentes) ; null si aucune
export async function champVille(statuts: StatutVille[], libelle = "Ville", id = "ville"): Promise<LabelBuilder | null> {
  const villes = await prisma.ville.findMany({
    where: { statut: { in: statuts } },
    orderBy: [{ statut: "asc" }, { id: "desc" }],
    take: OPTIONS_MAX,
  });
  if (villes.length === 0) return null;
  return champChoix(
    id,
    libelle,
    villes.map((ville) => ({
      label: ville.nom.slice(0, 100),
      value: String(ville.id),
      description:
        LIBELLE_STATUT_VILLE[ville.statut] + (ville.statut === StatutVille.ACTIVE ? ` · cycle ${ville.cycleActuel}` : ""),
    })),
  );
}

// Catalogue d'objets reparti sur plusieurs listes de 25 (par ordre alphabetique), une seule a remplir
export async function champsObjets(): Promise<LabelBuilder[]> {
  const objets = await prisma.objet.findMany({ orderBy: { nom: "asc" } });
  const champs: LabelBuilder[] = [];
  for (let debut = 0; debut < objets.length; debut += OPTIONS_MAX) {
    const tranche = objets.slice(debut, debut + OPTIONS_MAX);
    const plage = `${tranche[0].nom.charAt(0)}–${tranche[tranche.length - 1].nom.charAt(0)}`;
    champs.push(
      new LabelBuilder()
        .setLabel(`Objet (${plage})`)
        .setDescription("Choisir un objet dans une seule des listes")
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId(`objet-${champs.length}`)
            .setRequired(false)
            .addOptions(tranche.map((objet) => ({ label: objet.nom, value: String(objet.id) }))),
        ),
    );
  }
  return champs;
}

export function lireChoix(soumission: ModalSubmitInteraction, id: string): string | null {
  return soumission.fields.getStringSelectValues(id)[0] ?? null;
}

// Objet choisi dans les listes de champsObjets : null si aucune ou plusieurs listes remplies
export function lireObjet(soumission: ModalSubmitInteraction, nombreListes: number): number | null {
  const choix: string[] = [];
  for (let i = 0; i < nombreListes; i++) choix.push(...soumission.fields.getStringSelectValues(`objet-${i}`));
  return choix.length === 1 ? Number(choix[0]) : null;
}

export function lireMembre(soumission: ModalSubmitInteraction, id = "joueur"): User | null {
  return soumission.fields.getSelectedUsers(id)?.first() ?? null;
}

// Entier saisi dans [min, max] ; null si la saisie est invalide
export function lireEntier(texte: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(texte.trim())) return null;
  const valeur = Number(texte.trim());
  return valeur >= min && valeur <= max ? valeur : null;
}

// Ajustement d'une jauge : "80" fixe la valeur, "+20" / "-10" l'ajuste, vide la laisse inchangee.
// Renvoie la nouvelle valeur bornee, undefined si inchangee, null si la saisie est invalide.
export function lireAjustement(texte: string, actuelle: number, min: number, max: number): number | null | undefined {
  const saisie = texte.trim().replace(/\s+/g, "");
  if (!saisie) return undefined;
  const correspondance = /^([+-]?)(\d+)$/.exec(saisie);
  if (!correspondance) return null;
  const nombre = Number(correspondance[2]);
  const valeur = correspondance[1] === "+" ? actuelle + nombre : correspondance[1] === "-" ? actuelle - nombre : nombre;
  return Math.max(min, Math.min(max, valeur));
}

// --- Personnage cible ---

export const INCLUDE_JOUEUR_CIBLE = { ville: true, utilisateur: true } satisfies Prisma.JoueurInclude;
export type JoueurCible = Prisma.JoueurGetPayload<{ include: typeof INCLUDE_JOUEUR_CIBLE }>;

// Personnage courant du membre choisi, dans une ville aux statuts donnes (par defaut : en jeu)
export async function lireJoueur(
  soumission: ModalSubmitInteraction,
  statutsVille: StatutVille[] = [StatutVille.ACTIVE],
): Promise<JoueurCible | null> {
  const membre = lireMembre(soumission);
  if (!membre) return null;
  return prisma.joueur.findFirst({
    where: { utilisateur: { discordId: membre.id }, dateSortie: null, ville: { statut: { in: statutsVille } } },
    include: INCLUDE_JOUEUR_CIBLE,
  });
}

// --- Confirmation des actions destructives ---

// Renvoie le clic de confirmation (deja differe : repondre avec editReply), ou null si l'admin a renonce.
// Collecte sur le message de confirmation lui-meme (withResponse), comme ailleurs dans le bot.
export async function confirmer(
  interaction: ModalSubmitInteraction | ButtonInteraction,
  message: string,
  libelleConfirmation: string,
): Promise<MessageComponentInteraction | null> {
  const reponse = await interaction.reply({
    content: message,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("confirmer").setLabel(libelleConfirmation).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("annuler").setLabel("Annuler").setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
    withResponse: true,
  });

  const choix =
    (await reponse.resource?.message
      ?.awaitMessageComponent({ componentType: ComponentType.Button, time: DELAI_CONFIRMATION_MS })
      .catch(() => null)) ?? null;
  if (choix?.customId !== "confirmer") {
    const abandon = { content: "Action abandonnée.", components: [] };
    if (choix) await choix.update(abandon);
    else await interaction.editReply(abandon).catch(() => null);
    return null;
  }
  await choix.update({ content: "Action en cours...", components: [] });
  return choix;
}
