import { Metier, StatutJoueur, StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import { NOM_METIER, PLACES_PAR_METIER, PLACES_SANS_METIER } from "../../config/metiers";
import { PV_MAX } from "../../config/sante";
import { prisma } from "../../db";
import { deplacerJoueur } from "../deplacement";
import { appliquerExclusionDiscord, restreindreEcritureVille, retablirJoueurDiscord } from "../joueurDiscord";
import { rafraichirMessageVille } from "../messageVille";
import {
  DELAI_SELECTION_MS,
  champChoix,
  champMembre,
  journaliser,
  lireChoix,
  lireJoueur,
  ouvrirFormulaire,
  repondre,
  type FamilleAdmin,
  type JoueurCible,
} from "./outils";

// Famille "Joueur" du panneau /admin (conception.md §4) : teleporter, ressusciter, guerir, infecter,
// exclure et reintegrer de force, changer de metier. Le joueur est choisi parmi les membres du serveur ;
// son personnage courant est retrouve en base.

const VALEUR_EN_VILLE = "ville";
const VALEUR_SANS_METIER = "AUCUN";

const SANS_PERSONNAGE = "Ce membre n'a pas de personnage dans une ville en jeu.";

function mention(joueur: JoueurCible): string {
  return `<@${joueur.utilisateur.discordId}>`;
}

function detailJournal(joueur: JoueurCible): string {
  return `${joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId} (${joueur.ville?.nom ?? "sans ville"})`;
}

// Formulaire de choix du joueur puis controle de son statut ; null si l'action ne peut pas avoir lieu
async function choisirJoueur(
  interaction: ButtonInteraction,
  titre: string,
  statutsAttendus: StatutJoueur[],
  refus: string,
): Promise<{ soumission: ModalSubmitInteraction; joueur: JoueurCible } | null> {
  const soumission = await ouvrirFormulaire(interaction, titre, [champMembre()]);
  if (!soumission) return null;
  const joueur = await lireJoueur(soumission);
  if (!joueur) {
    await repondre(soumission, SANS_PERSONNAGE);
    return null;
  }
  if (!statutsAttendus.includes(joueur.statut)) {
    await repondre(soumission, `${mention(joueur)} ${refus}`);
    return null;
  }
  return { soumission, joueur };
}

// --- Teleporter : choix de la zone (ou retour en ville) parmi les territoires du groupe ---

async function teleporter(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirJoueur(interaction, "Téléporter un joueur", [StatutJoueur.VIVANT, StatutJoueur.EXCLU], "n'est pas vivant.");
  if (!cible) return;
  const { soumission, joueur } = cible;

  const zones = await prisma.zone.findMany({ where: { groupeId: joueur.ville?.groupeId ?? -1 }, orderBy: { id: "asc" } });
  const reponse = await soumission.reply({
    content: `Téléporter ${mention(joueur)} (actuellement ${joueur.zoneActuelleId === null ? "en ville" : "en territoire externe"}) :`,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("zone")
          .setPlaceholder("Destination")
          .addOptions(
            { label: `En ville (${joueur.ville?.nom ?? "?"})`.slice(0, 100), value: VALEUR_EN_VILLE },
            ...zones.map((zone) => ({ label: zone.nom, value: String(zone.id), default: zone.id === joueur.zoneActuelleId })),
          ),
      ),
    ],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
    withResponse: true,
  });

  const choix =
    (await reponse.resource?.message
      ?.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: DELAI_SELECTION_MS })
      .catch(() => null)) ?? null;
  if (!choix) {
    await soumission.editReply({ content: "Délai dépassé, téléportation annulée.", components: [] }).catch(() => null);
    return;
  }

  const zone = choix.values[0] === VALEUR_EN_VILLE ? null : (zones.find((z) => String(z.id) === choix.values[0]) ?? null);
  await choix.deferUpdate();
  await deplacerJoueur(guild, joueur, zone?.id ?? null, 0);

  const destination = zone ? zone.nom : "en ville";
  await journaliser(interaction.user, "Téléporter un joueur", `${detailJournal(joueur)} → ${destination}`);
  await choix.editReply({ content: `${mention(joueur)} a été téléporté : ${destination}.`, components: [] });
}

// --- Ressusciter : un mort (ou zombifie) revient a la vie a pleine sante, sans infection ---

async function ressusciter(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirJoueur(interaction, "Ressusciter un joueur", [StatutJoueur.MORT, StatutJoueur.ZOMBIFIE], "n'est pas mort.");
  if (!cible) return;
  const { soumission, joueur } = cible;

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  await prisma.joueur.update({
    where: { id: joueur.id },
    data: { statut: StatutJoueur.VIVANT, pv: PV_MAX, infecteDepuis: null, dateMort: null, causeMort: null },
  });
  await retablirJoueurDiscord(guild, joueur.utilisateur.discordId, joueur.villeId!);
  await journaliser(interaction.user, "Ressusciter un joueur", detailJournal(joueur));
  await soumission.editReply({ content: `${mention(joueur)} est revenu à la vie (${PV_MAX} PV, en ville).`, allowedMentions: { parse: [] } });
}

// --- Guerir : PV au maximum et infection retiree ---

async function guerir(interaction: ButtonInteraction) {
  const cible = await choisirJoueur(interaction, "Guérir un joueur", [StatutJoueur.VIVANT, StatutJoueur.EXCLU], "n'est pas vivant.");
  if (!cible) return;
  const { soumission, joueur } = cible;

  await prisma.joueur.update({ where: { id: joueur.id }, data: { pv: PV_MAX, infecteDepuis: null } });
  await journaliser(interaction.user, "Guérir un joueur", detailJournal(joueur));
  await repondre(
    soumission,
    `${mention(joueur)} est guéri : ${PV_MAX}/${PV_MAX} PV` + (joueur.infecteDepuis ? ", infection soignée." : "."),
  );
}

// --- Infecter : declenche l'infection cachee (incubation de 96h) ---

async function infecter(interaction: ButtonInteraction) {
  const cible = await choisirJoueur(interaction, "Infecter un joueur", [StatutJoueur.VIVANT, StatutJoueur.EXCLU], "n'est pas vivant.");
  if (!cible) return;
  const { soumission, joueur } = cible;
  if (joueur.infecteDepuis) {
    await repondre(soumission, `${mention(joueur)} est déjà infecté.`);
    return;
  }

  await prisma.joueur.update({ where: { id: joueur.id }, data: { infecteDepuis: new Date() } });
  await journaliser(interaction.user, "Infecter un joueur", detailJournal(joueur));
  await repondre(soumission, `${mention(joueur)} est infecté (information cachée aux autres joueurs).`);
}

// --- Exclure / reintegrer de force ---

async function exclure(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirJoueur(interaction, "Exclure un joueur", [StatutJoueur.VIVANT], "n'est pas un citoyen vivant de sa ville.");
  if (!cible) return;
  const { soumission, joueur } = cible;

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const etaitMaire = joueur.ville?.maireId === joueur.id;
  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueur.id }, data: { statut: StatutJoueur.EXCLU } }),
    ...(etaitMaire
      ? [prisma.ville.update({ where: { id: joueur.villeId! }, data: { maireId: null, mandatFinCycle: null } })]
      : []),
  ]);
  await appliquerExclusionDiscord(guild, joueur.utilisateur.discordId, joueur.villeId!);
  await journaliser(interaction.user, "Exclure un joueur", detailJournal(joueur));
  await soumission.editReply({
    content:
      `${mention(joueur)} est exclu de **${joueur.ville?.nom}** : il n'a plus accès à ses salons mais reste en territoire externe.` +
      (etaitMaire ? " Il était maire : la ville n'a plus de maire." : ""),
    allowedMentions: { parse: [] },
  });
}

async function reintegrer(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirJoueur(interaction, "Réintégrer un joueur", [StatutJoueur.EXCLU], "n'est pas exclu.");
  if (!cible) return;
  const { soumission, joueur } = cible;

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  await prisma.joueur.update({ where: { id: joueur.id }, data: { statut: StatutJoueur.VIVANT } });
  await retablirJoueurDiscord(guild, joueur.utilisateur.discordId, joueur.villeId!);
  // Toujours en territoire externe : il retrouve la vue de sa ville, mais pas l'ecriture
  if (joueur.zoneActuelleId !== null) await restreindreEcritureVille(guild, joueur.utilisateur.discordId, joueur.villeId!, true);
  await journaliser(interaction.user, "Réintégrer un joueur", detailJournal(joueur));
  await soumission.editReply({ content: `${mention(joueur)} est réintégré dans **${joueur.ville?.nom}**.`, allowedMentions: { parse: [] } });
}

// --- Changer de metier : possible aussi avant la fondation ; les places par metier peuvent etre depassees ---

async function changerMetier(interaction: ButtonInteraction, guild: Guild) {
  const soumission = await ouvrirFormulaire(interaction, "Changer de métier", [
    champMembre(),
    champChoix("metier", "Nouveau métier", [
      { label: "Simple citoyen (sans métier)", value: VALEUR_SANS_METIER },
      ...Object.values(Metier).map((metier) => ({ label: NOM_METIER[metier], value: metier })),
    ]),
  ]);
  if (!soumission) return;

  const joueur = await lireJoueur(soumission, [StatutVille.EN_CREATION, StatutVille.ACTIVE]);
  if (!joueur) {
    await repondre(soumission, "Ce membre n'a pas de personnage dans une ville en création ou en jeu.");
    return;
  }
  const valeur = lireChoix(soumission, "metier");
  const metier = valeur === VALEUR_SANS_METIER ? null : (valeur as Metier);
  if (metier === joueur.metier) {
    await repondre(soumission, `${mention(joueur)} a déjà ce métier.`);
    return;
  }

  const occupees = await prisma.joueur.count({
    where: { villeId: joueur.villeId, dateSortie: null, metier, id: { not: joueur.id } },
  });
  const places = metier ? PLACES_PAR_METIER[metier] : PLACES_SANS_METIER;

  await prisma.joueur.update({ where: { id: joueur.id }, data: { metier } });
  if (joueur.ville?.statut === StatutVille.EN_CREATION) await rafraichirMessageVille(guild, joueur.villeId!);

  const ancien = joueur.metier ? NOM_METIER[joueur.metier] : "sans métier";
  const nouveau = metier ? NOM_METIER[metier] : "sans métier";
  await journaliser(interaction.user, "Changer de métier", `${detailJournal(joueur)} : ${ancien} → ${nouveau}`);
  await repondre(
    soumission,
    `${mention(joueur)} : ${ancien} → **${nouveau}**.` +
      (occupees >= places ? ` ⚠️ Places dépassées dans la ville (${occupees + 1}/${places}).` : ""),
  );
}

export const FAMILLE_JOUEUR: FamilleAdmin = {
  cle: "joueur",
  titre: "Joueur",
  emoji: "🧍",
  resume: "position, vie, santé, exclusion et métier d'un personnage",
  actions: [
    {
      cle: "teleporter",
      libelle: "Téléporter",
      description: "déplace un joueur vivant dans une zone de son groupe, ou le ramène en ville.",
      executer: teleporter,
    },
    {
      cle: "ressusciter",
      libelle: "Ressusciter",
      description: "ramène un joueur mort à la vie, en ville, à pleine santé et sans infection.",
      style: ButtonStyle.Success,
      executer: ressusciter,
    },
    { cle: "guerir", libelle: "Guérir", description: "rend tous ses PV à un joueur et soigne son infection.", style: ButtonStyle.Success, executer: guerir },
    { cle: "infecter", libelle: "Infecter", description: "déclenche une infection cachée (incubation de 96h).", style: ButtonStyle.Danger, executer: infecter },
    {
      cle: "exclure",
      libelle: "Exclure de force",
      description: "retire à un joueur l'accès aux salons de sa ville ; il reste en territoire externe.",
      style: ButtonStyle.Danger,
      executer: exclure,
    },
    { cle: "reintegrer", libelle: "Réintégrer de force", description: "rend à un joueur exclu l'accès à sa ville.", executer: reintegrer },
    {
      cle: "metier",
      libelle: "Changer de métier",
      description: "change le métier d'un joueur, avant ou après la fondation (les places peuvent être dépassées).",
      executer: changerMetier,
    },
  ],
};
