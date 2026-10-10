import { StatutElection, StatutJoueur, StatutVille, TypeElection, type Election } from "@prisma/client";
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
import { DUREE_DEFIANCE_HEURES } from "../config/politique";
import { prisma } from "../db";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { horodatage, pourvoirMairieVacante } from "./election";
import { estMjActif, MESSAGE_MJ_ACTIF_NE_JOUE_PAS } from "./permissions";
import { trouverSalonTexte } from "./reconcile";
import { posterDansMairie } from "./villeStructure";
import { verrouille } from "../services/verrou";

// Vote de defiance (conception.md §5) : un citoyen vivant, autre que le maire, le declenche (bouton « Défiance » de
// /action, avec confirmation) quand la ville a un maire et qu'aucun vote de defiance n'est en cours. Vote ouvert
// aussitot pour 24 h reelles, reserve aux citoyens vivants presents en ville (le maire compris), secret et modifiable.
// Destitue si « Destituer » > « Maintenir » (egalite ou aucun vote : maintenu) ; sans effet si le maire vise n'est
// plus maire a la cloture. Le destitue libere la mairie (election aussitot, sauf s'il y en a deja une) et peut se
// representer. Cloture verifiee chaque minute (scheduler/cycle.ts), avancable depuis /admin (« Clore la défiance »).
// Reutilise Election (type DEFIANCE, maireCibleId, dateVote = ouverture) et Vote (choixDestitution = Destituer).

const COULEUR = 0xd35400;
const COULEUR_TERMINEE = 0x7f8c8d;
const HEURE_MS = 3_600_000;

export function defianceEnCours(villeId: number) {
  return prisma.election.findFirst({ where: { villeId, type: TypeElection.DEFIANCE, statut: StatutElection.EN_COURS } });
}

function finDuVote(election: Election): Date {
  return new Date(election.dateVote.getTime() + DUREE_DEFIANCE_HEURES * HEURE_MS);
}

async function decompte(electionId: number): Promise<{ destituer: number; maintenir: number }> {
  const votes = await prisma.vote.findMany({ where: { electionId } });
  const destituer = votes.filter((v) => v.choixDestitution === true).length;
  return { destituer, maintenir: votes.length - destituer };
}

// --- Panneau de la mairie ---

async function construirePanneau(electionId: number, resultat?: string): Promise<ContainerBuilder> {
  const election = await prisma.election.findUniqueOrThrow({ where: { id: electionId } });
  const maire = await prisma.joueur.findUniqueOrThrow({ where: { id: election.maireCibleId! }, include: { utilisateur: true } });
  const terminee = election.statut === StatutElection.TERMINEE;
  const votes = await decompte(electionId);
  const total = votes.destituer + votes.maintenir;

  const etape = terminee
    ? `${resultat ?? "Le vote est clos."}\nDestituer : ${votes.destituer} · Maintenir : ${votes.maintenir}`
    : `Vote ouvert jusqu'au ${horodatage(finDuVote(election))}. Seuls les citoyens vivants **présents en ville** votent ; ` +
      "vote secret, modifiable jusqu'à la clôture. Il faut plus de « Destituer » que de « Maintenir ».\n" +
      `🗳️ ${total} vote${total > 1 ? "s" : ""} déposé${total > 1 ? "s" : ""}.`;
  const panneau = new ContainerBuilder()
    .setAccentColor(terminee ? COULEUR_TERMINEE : COULEUR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⚖️ Vote de défiance contre <@${maire.utilisateur.discordId}>\n${etape}`));
  if (terminee) return panneau;
  return panneau.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`defiance:destituer:${electionId}`).setLabel("Destituer").setEmoji("⚖️").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`defiance:maintenir:${electionId}`).setLabel("Maintenir").setStyle(ButtonStyle.Secondary),
    ),
  );
}

async function rafraichirPanneau(guild: Guild, electionId: number, resultat?: string): Promise<void> {
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) return;
  const salon = await trouverSalonTexte(guild, `salon:ville:${election.villeId}:mairie`);
  if (!salon) return;
  const components = [await construirePanneau(electionId, resultat)];
  const existant = election.messageId ? await salon.messages.fetch(election.messageId).catch(() => null) : null;
  if (existant) {
    await existant.edit({ components, allowedMentions: { parse: [] } }).catch(() => null);
    return;
  }
  const message = await salon.send({ components, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }).catch(() => null);
  if (message) await prisma.election.update({ where: { id: electionId }, data: { messageId: message.id } });
}

// --- Declenchement ---

// Conditions pour declencher un vote de defiance ; null si tout va bien
export async function empechementDefiance(joueurId: number): Promise<string | null> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  if (joueur.statut !== StatutJoueur.VIVANT) return "Seuls les citoyens vivants peuvent déclencher un vote de défiance.";
  if (joueur.ville?.statut !== StatutVille.ACTIVE) return "Votre ville n'est pas en jeu.";
  if (joueur.ville.maireId === null) return "La ville n'a pas de maire.";
  if (joueur.ville.maireId === joueur.id) return "Vous ne pouvez pas lancer un vote de défiance contre vous-même.";
  if (await defianceEnCours(joueur.ville.id)) return "⚖️ Un vote de défiance est déjà en cours : son panneau est dans la mairie.";
  return null;
}

export const declencherDefiance = verrouille(async function declencherDefiance(guild: Guild, joueurId: number): Promise<string> {
  const raison = await empechementDefiance(joueurId);
  if (raison) return raison;
  const joueur = await prisma.joueur.findUniqueOrThrow({
    where: { id: joueurId },
    include: { utilisateur: true, ville: { include: { maire: { include: { utilisateur: true } } } } },
  });
  const ville = joueur.ville!;
  const maire = ville.maire!;
  const election = await prisma.election.create({
    data: { villeId: ville.id, type: TypeElection.DEFIANCE, maireCibleId: maire.id, dateVote: new Date(), voteOuvert: true },
  });
  await prisma.journalEntree.create({
    data: { villeId: ville.id, joueurId, message: `Vote de défiance contre ${maire.utilisateur.pseudoCache ?? maire.utilisateur.discordId} déclenché` },
  });
  await posterDansMairie(
    guild,
    ville.id,
    `⚖️ <@${joueur.utilisateur.discordId}> déclenche un **vote de défiance** contre le maire <@${maire.utilisateur.discordId}>. ` +
      `Vote ouvert jusqu'au ${horodatage(finDuVote(election))}, avec le panneau ci-dessous.`,
    { mentionnerVille: true },
  );
  await rafraichirPanneau(guild, election.id);
  return `⚖️ Le vote de défiance est ouvert pour ${DUREE_DEFIANCE_HEURES} h : le panneau est dans la mairie.`;
});

// --- Boutons du panneau : "defiance:<destituer|maintenir>:<electionId>" ---

export async function gererBoutonDefiance(interaction: ButtonInteraction, action: string, idBrut: string): Promise<void> {
  const electionId = Number(idBrut);
  if (!interaction.guild || !Number.isInteger(electionId) || (action !== "destituer" && action !== "maintenir")) return;
  const refuser = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (election?.statut !== StatutElection.EN_COURS) {
    await refuser("Ce vote est clos.");
    return;
  }
  if (await estMjActif(interaction.guild, interaction.user.id)) {
    await refuser(MESSAGE_MJ_ACTIF_NE_JOUE_PAS);
    return;
  }
  const joueur = await trouverJoueurActif((await trouverOuCreerUtilisateur(interaction.user)).id);
  if (!joueur || joueur.villeId !== election.villeId) {
    await refuser("Ce vote n'est pas celui de votre ville.");
    return;
  }
  if (joueur.statut !== StatutJoueur.VIVANT) {
    await refuser("Seuls les citoyens vivants votent.");
    return;
  }
  if (joueur.zoneActuelleId !== null) {
    await refuser("Seuls les citoyens présents en ville votent : rentrez en ville pour voter.");
    return;
  }

  const destituer = action === "destituer";
  await prisma.vote.upsert({
    where: { electionId_votantId: { electionId, votantId: joueur.id } },
    update: { choixDestitution: destituer, dateVote: new Date() },
    create: { electionId, votantId: joueur.id, choixDestitution: destituer },
  });
  await refuser(`🗳️ Vote enregistré : **${destituer ? "Destituer" : "Maintenir"}**. Vous pouvez en changer jusqu'à la clôture.`);
  await rafraichirPanneau(interaction.guild, electionId);
}

// --- Cloture ---

export async function verifierDefiances(guild: Guild): Promise<void> {
  const maintenant = Date.now();
  const elections = await prisma.election.findMany({
    where: { type: TypeElection.DEFIANCE, statut: StatutElection.EN_COURS, ville: { statut: StatutVille.ACTIVE } },
  });
  for (const election of elections) {
    if (finDuVote(election).getTime() > maintenant) continue;
    await cloreDefiance(guild, election).catch((error) => console.error(`Clôture du vote de défiance ${election.id}`, error));
  }
}

// Depouille le vote (a l'echeance, ou sans attendre depuis /admin) ; renvoie ce qui s'est passe
export const cloreDefiance = verrouille(async function cloreDefiance(guild: Guild, election: Election): Promise<string> {
  // Garde contre une double cloture (verification periodique et /admin en meme temps)
  const { count } = await prisma.election.updateMany({
    where: { id: election.id, statut: StatutElection.EN_COURS },
    data: { statut: StatutElection.TERMINEE },
  });
  if (count === 0) return "Le vote de défiance a déjà été clos entre-temps.";

  const { destituer, maintenir } = await decompte(election.id);
  const maire = await prisma.joueur.findUniqueOrThrow({ where: { id: election.maireCibleId! }, include: { utilisateur: true } });
  const mention = `<@${maire.utilisateur.discordId}>`;
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: election.villeId } });
  const conclure = async (texte: string) => {
    await posterDansMairie(guild, election.villeId, `⚖️ ${texte}`, { mentionnerVille: true });
    await rafraichirPanneau(guild, election.id, texte);
    return texte;
  };

  if (ville.maireId !== maire.id) return conclure(`Le vote de défiance contre ${mention} est sans effet : il n'est plus maire.`);
  if (destituer <= maintenir) return conclure(`La ville maintient ${mention} à la mairie.`);

  await prisma.$transaction([
    prisma.ville.update({ where: { id: ville.id }, data: { maireId: null, mandatFinCycle: null } }),
    prisma.journalEntree.create({ data: { villeId: ville.id, joueurId: maire.id, message: "Destitué par un vote de défiance" } }),
  ]);
  const texte = await conclure(`La ville destitue ${mention} : la mairie est vacante. Il peut se représenter.`);
  await pourvoirMairieVacante(guild, ville.id);
  return texte;
});
