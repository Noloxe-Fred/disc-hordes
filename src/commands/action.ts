import { StatutJoueur, StatutVille, TypePhase, type PalierZone } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import type { Command } from "../client";
import { LIBELLE_CAUSE_MORT } from "../config/mort";
import { prisma } from "../db";
import { deplacerJoueur } from "../discord/deplacement";
import { retirerJoueurDeVilleDiscord } from "../discord/joueurDiscord";
import { trouverSalonTexte } from "../discord/reconcile";
import { coutDeplacement } from "../game/deplacement";
import { calculerPaMax } from "../game/pa";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { destinationsDepuis } from "../services/zones";

// Menu des actions du joueur (conception.md §4). Vivant (ou exclu) : un bouton par type d'action, chacun
// ouvrant son ecran (pour l'instant « Se deplacer », avec confirmation avant de depenser des PA) ; fouille,
// observation et combat s'y ajouteront. Mort : quitter sa ville pour en rejoindre une autre.

const DELAI_CHOIX_MS = 120_000;
const COULEUR_VIVANT = 0x2ecc71;
const COULEUR_MORT = 0xc0392b;
const VALEUR_VILLE = "ville";

function encadre(texte: string, couleur = COULEUR_VIVANT): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(couleur).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte));
}

interface Destination {
  id: number | null; // null = la ville
  nom: string;
  palier: PalierZone | null;
  cout: number;
}

// --- Vivant ou exclu : menu d'actions, un bouton par type d'action ---
// Le menu, puis l'ecran de chaque action, remplacent le meme message ; « Retour » ramene au menu.

function boutonRetour(): ButtonBuilder {
  return new ButtonBuilder().setCustomId("retour").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary);
}

async function actionsVivant(interaction: ChatInputCommandInteraction, guild: Guild, joueurId: number) {
  const joueur = await prisma.joueur.findUniqueOrThrow({
    where: { id: joueurId },
    include: { ville: true, zoneActuelle: true },
  });
  const ville = joueur.ville!;
  const groupeId = ville.groupeId;
  if (ville.statut !== StatutVille.ACTIVE || groupeId === null) {
    await interaction.reply({
      content: `**${ville.nom}** n'est pas encore fondée : les actions seront disponibles au lancement de la partie.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const exclu = joueur.statut === StatutJoueur.EXCLU;
  const paActuel = joueur.paActuel ?? 0;
  const entete =
    `## Actions — ${ville.nom}\n` +
    `📍 ${joueur.zoneActuelle ? joueur.zoneActuelle.nom : "En ville"}` +
    ` · ⚡ ${paActuel} / ${calculerPaMax(joueur).paMax} PA` +
    (ville.phaseActuelle === TypePhase.NUIT ? " · 🌙 nuit : actions plus coûteuses" : " · ☀️ jour") +
    (exclu ? "\nVous êtes **exclu** de votre ville : vous ne pouvez pas y rentrer." : "");

  const menu = encadre(`${entete}\nQue voulez-vous faire ?`).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("deplacer").setLabel("Se déplacer").setEmoji("🧭").setStyle(ButtonStyle.Primary),
    ),
  );

  const accessibles = await destinationsDepuis(groupeId, joueur.zoneActuelleId);
  const destinations: Destination[] = [
    ...(accessibles.ville && !exclu ? [{ id: null, nom: `Rentrer en ville (${ville.nom})`, palier: null }] : []),
    ...accessibles.zones.map((z) => ({ id: z.id, nom: z.nom, palier: z.palier })),
  ].map((d) => ({ ...d, cout: coutDeplacement(d.palier, ville.phaseActuelle) }));
  const valeur = (d: Destination) => (d.id === null ? VALEUR_VILLE : String(d.id));

  const ecranDeplacement = encadre(`${entete}\n**Se déplacer** : choisissez une destination.`).addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("aller")
        .setPlaceholder("Aller vers…")
        .addOptions(
          destinations.map((d) => ({
            label: d.nom.slice(0, 100),
            value: valeur(d),
            description: `${d.cout} PA${d.cout > paActuel ? " — PA insuffisants" : ""}`,
          })),
        ),
    ),
  ).addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour()));

  const reponse = await interaction.reply({ components: [menu], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

  let destination: Destination | undefined;
  for (;;) {
    const clic = await reponse.awaitMessageComponent({ time: DELAI_CHOIX_MS }).catch(() => null);
    if (!clic) return;

    if (clic.customId === "retour") {
      await clic.update({ components: [menu] });
    } else if (clic.customId === "deplacer") {
      await clic.update({ components: [ecranDeplacement] });
    } else if (clic.isStringSelectMenu() && clic.customId === "aller") {
      destination = destinations.find((d) => valeur(d) === clic.values[0]);
      if (!destination) return;
      // Confirmation avant de depenser des PA (conception.md §4)
      await clic.update({
        components: [
          destination.cout > paActuel
            ? encadre(
                `${entete}\n\nIl vous faut **${destination.cout} PA** pour aller vers ${destination.nom} (vous en avez ${paActuel}).`,
              ).addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour()))
            : encadre(`${entete}\n\nAller vers **${destination.nom}** pour **${destination.cout} PA** ?`).addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId("confirmer")
                    .setLabel(`Y aller (${destination.cout} PA)`)
                    .setStyle(ButtonStyle.Primary),
                  boutonRetour(),
                ),
              ),
        ],
      });
    } else if (clic.customId === "confirmer" && destination) {
      await clic.deferUpdate();
      await clic.editReply({ components: [encadre(await confirmerDeplacement(guild, joueurId, joueur.zoneActuelleId, groupeId, destination))] });
      return;
    }
  }
}

// Deplacement confirme : reverification (phase, PA ou position ont pu changer pendant la confirmation), puis
// execution. Renvoie le texte a afficher au joueur.
async function confirmerDeplacement(
  guild: Guild,
  joueurId: number,
  zoneDepartId: number | null,
  groupeId: number,
  destination: Destination,
): Promise<string> {
  const actuel = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const ville = actuel.ville!;
  const cout = coutDeplacement(destination.palier, ville.phaseActuelle);
  const depuisActuel = await destinationsDepuis(groupeId, actuel.zoneActuelleId);
  const toujoursAccessible =
    destination.id === null ? depuisActuel.ville : depuisActuel.zones.some((z) => z.id === destination.id);
  const paRestants = (actuel.paActuel ?? 0) - cout;

  if (actuel.statut !== StatutJoueur.VIVANT && actuel.statut !== StatutJoueur.EXCLU) return "Vous ne pouvez plus vous déplacer.";
  if (actuel.zoneActuelleId !== zoneDepartId || !toujoursAccessible) return "Votre position a changé entre-temps : relancez `/action`.";
  if (paRestants < 0) return `Il vous faut **${cout} PA** pour ce déplacement.`;

  await deplacerJoueur(guild, actuel, destination.id, cout);
  await prisma.journalEntree.create({
    data: {
      villeId: ville.id,
      joueurId,
      message: `Déplacement : ${destination.id === null ? "retour en ville" : destination.nom}`,
      public: false, // rien de public en territoire externe (conception.md §7)
    },
  });

  if (destination.id === null) return `🏠 Vous êtes rentré à **${ville.nom}** (−${cout} PA, ${paRestants} restants).`;
  const salon = await trouverSalonTexte(guild, `salon:zone:${destination.id}`);
  return (
    `🧭 Vous êtes arrivé : **${destination.nom}**${salon ? ` — ${salon}` : ""} (−${cout} PA, ${paRestants} restants).\n` +
    "Tant que vous êtes dehors, vous ne pouvez plus écrire dans les salons de la ville."
  );
}

// --- Mort : quitter sa ville pour en rejoindre une autre ---

async function actionsMort(interaction: ChatInputCommandInteraction, guild: Guild, joueurId: number) {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const ville = joueur.ville!;

  const conteneur = encadre(
    `## 💀 Vous êtes mort\n` +
      `${joueur.causeMort ? `Vous avez été ${LIBELLE_CAUSE_MORT[joueur.causeMort]}. ` : ""}` +
      `Vous voyez toujours **${ville.nom}** mais ne pouvez plus y agir.\n` +
      "Vous pouvez quitter définitivement cette ville pour en rejoindre ou en créer une autre avec un nouveau personnage.",
    COULEUR_MORT,
  ).addActionRowComponents(
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
}

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

    if (joueur.statut === StatutJoueur.VIVANT || joueur.statut === StatutJoueur.EXCLU) {
      await actionsVivant(interaction, guild, joueur.id);
    } else {
      await actionsMort(interaction, guild, joueur.id);
    }
  },
};

export default command;
