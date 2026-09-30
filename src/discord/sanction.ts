import { CauseMort, PalierZone, StatutElection, StatutJoueur, TypeElection, type Election } from "@prisma/client";
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
import { enregistrerMort } from "../game/mort";
import { prochaineBascule } from "../scheduler/cycle";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { estMaireEnExercice } from "./annonce";
import { horodatage } from "./election";
import { deplacerJoueur } from "./deplacement";
import { appliquerExclusionDiscord } from "./joueurDiscord";
import { estMjActif, MESSAGE_MJ_ACTIF_NE_JOUE_PAS } from "./permissions";
import { trouverSalonTexte } from "./reconcile";
import { posterDansMairie } from "./villeStructure";

// Bannissement et execution (conception.md §5) : le maire les propose depuis son panneau (/action → « Maire »), la
// ville tranche par un vote Pour/Contre ouvert jusqu'au prochain changement de phase, reserve aux citoyens vivants
// presents en ville (vote modifiable). Adopte si Pour > Contre ; egalite ou aucun vote : rejete.
// Bannissement adopte : le citoyen est exclu (statut EXCLU) et, s'il est en ville, jete dans une zone proche au hasard.
// Execution adoptee : le citoyen est pendu s'il est en ville, sinon des qu'il y rentre (Joueur.executionEnAttente).
// Les votes reutilisent Election (type BANNISSEMENT / EXECUTION, cibleId) et Vote (choixDestitution = Pour).

type TypeSanction = typeof TypeElection.BANNISSEMENT | typeof TypeElection.EXECUTION;

const COULEUR = 0xc0392b;
const COULEUR_TERMINEE = 0x7f8c8d;
const TYPES_SANCTION = [TypeElection.BANNISSEMENT, TypeElection.EXECUTION];

const LIBELLE: Record<TypeSanction, { titre: string; emoji: string; pour: string; contre: string }> = {
  [TypeElection.BANNISSEMENT]: { titre: "Bannissement", emoji: "🔨", pour: "Bannir", contre: "Garder" },
  [TypeElection.EXECUTION]: { titre: "Exécution", emoji: "🪢", pour: "Pendre", contre: "Épargner" },
};

function libelle(election: Election) {
  return LIBELLE[election.type as TypeSanction];
}

async function decompte(electionId: number): Promise<{ pour: number; contre: number }> {
  const votes = await prisma.vote.findMany({ where: { electionId } });
  const pour = votes.filter((v) => v.choixDestitution === true).length;
  return { pour, contre: votes.length - pour };
}

// --- Panneau de la mairie ---

async function construirePanneau(electionId: number, resultat?: string): Promise<ContainerBuilder> {
  const election = await prisma.election.findUniqueOrThrow({ where: { id: electionId } });
  const cible = await prisma.joueur.findUniqueOrThrow({ where: { id: election.cibleId! }, include: { utilisateur: true } });
  const { titre, emoji, pour, contre } = libelle(election);
  const terminee = election.statut === StatutElection.TERMINEE;
  const votes = await decompte(electionId);

  const etape = terminee
    ? `${resultat ?? "Le vote est clos."}\n${pour} : ${votes.pour} · ${contre} : ${votes.contre}`
    : `Vote ouvert jusqu'au changement de phase, ${horodatage(prochaineBascule())}. Seuls les citoyens vivants **présents en ville** ` +
      `votent ; vous pouvez changer d'avis jusqu'à la clôture. Il faut plus de « ${pour} » que de « ${contre} ».\n` +
      `🗳️ ${votes.pour + votes.contre} vote${votes.pour + votes.contre > 1 ? "s" : ""} déposé${votes.pour + votes.contre > 1 ? "s" : ""}.`;
  const panneau = new ContainerBuilder()
    .setAccentColor(terminee ? COULEUR_TERMINEE : COULEUR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emoji} ${titre} de <@${cible.utilisateur.discordId}>\n${etape}`));
  if (terminee) return panneau;
  return panneau.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`sanction:pour:${electionId}`).setLabel(pour).setEmoji(emoji).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`sanction:contre:${electionId}`).setLabel(contre).setStyle(ButtonStyle.Secondary),
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

// --- Lancement par le maire ---

// Citoyens que le maire peut viser : vivants de sa ville, hors lui-meme
export function ciblesPossibles(villeId: number, maireId: number) {
  return prisma.joueur.findMany({
    where: { villeId, statut: StatutJoueur.VIVANT, dateSortie: null, id: { not: maireId } },
    include: { utilisateur: true },
    orderBy: { id: "asc" },
  });
}

export async function lancerSanction(guild: Guild, maireId: number, type: TypeSanction, cibleId: number, motif: string): Promise<string> {
  const maire = await prisma.joueur.findUniqueOrThrow({ where: { id: maireId }, include: { ville: true, utilisateur: true } });
  if (!estMaireEnExercice(maire)) return "Vous n'êtes plus maire.";
  const villeId = maire.villeId!;
  const cible = (await ciblesPossibles(villeId, maireId)).find((c) => c.id === cibleId);
  if (!cible) return "Ce citoyen n'est plus un habitant vivant de la ville.";
  const enCours = await prisma.election.findFirst({
    where: { villeId, cibleId, type: { in: TYPES_SANCTION }, statut: StatutElection.EN_COURS },
  });
  if (enCours) return `Un vote vise déjà <@${cible.utilisateur.discordId}> : attendez sa clôture.`;

  const election = await prisma.election.create({ data: { villeId, type, cibleId, dateVote: new Date(), voteOuvert: true } });
  const { titre, emoji } = libelle(election);
  await prisma.journalEntree.create({
    data: { villeId, joueurId: maireId, message: `${titre} de ${cible.utilisateur.pseudoCache ?? cible.utilisateur.discordId} soumis au vote` },
  });
  const action = type === TypeElection.BANNISSEMENT ? "le bannissement" : "l'exécution";
  await posterDansMairie(
    guild,
    villeId,
    `${emoji} Le maire <@${maire.utilisateur.discordId}> demande ${action} de <@${cible.utilisateur.discordId}>.` +
      (motif ? `\n> ${motif.replace(/\n/g, "\n> ")}` : "") +
      "\nLa ville vote jusqu'au changement de phase, avec le panneau ci-dessous.",
    { mentionnerVille: true },
  );
  await rafraichirPanneau(guild, election.id);
  return `${emoji} Le vote sur ${action} de <@${cible.utilisateur.discordId}> est ouvert dans la mairie jusqu'au changement de phase.`;
}

// --- Boutons du panneau : "sanction:<pour|contre>:<electionId>" ---

export async function gererBoutonSanction(interaction: ButtonInteraction, action: string, idBrut: string): Promise<void> {
  const electionId = Number(idBrut);
  if (!interaction.guild || !Number.isInteger(electionId) || (action !== "pour" && action !== "contre")) return;
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

  const pour = action === "pour";
  await prisma.vote.upsert({
    where: { electionId_votantId: { electionId, votantId: joueur.id } },
    update: { choixDestitution: pour, dateVote: new Date() },
    create: { electionId, votantId: joueur.id, choixDestitution: pour },
  });
  const { pour: libellePour, contre: libelleContre } = libelle(election);
  await refuser(`🗳️ Vote enregistré : **${pour ? libellePour : libelleContre}**. Vous pouvez en changer jusqu'à la clôture.`);
  await rafraichirPanneau(interaction.guild, electionId);
}

// --- Cloture au changement de phase ---

// Clot les votes de sanction de la ville (appele au debut de chaque changement de phase). Renvoie true si la ville est
// tombee (dernier habitant vivant pendu).
export async function cloreSanctions(guild: Guild, villeId: number): Promise<boolean> {
  const elections = await prisma.election.findMany({
    where: { villeId, type: { in: TYPES_SANCTION }, statut: StatutElection.EN_COURS },
  });
  for (const election of elections) {
    try {
      if (await cloreSanction(guild, election)) return true;
    } catch (error) {
      console.error(`Clôture du vote de sanction ${election.id}`, error);
    }
  }
  return false;
}

async function cloreSanction(guild: Guild, election: Election): Promise<boolean> {
  const { count } = await prisma.election.updateMany({
    where: { id: election.id, statut: StatutElection.EN_COURS },
    data: { statut: StatutElection.TERMINEE },
  });
  if (count === 0) return false;

  const { pour, contre } = await decompte(election.id);
  const cible = await prisma.joueur.findUniqueOrThrow({ where: { id: election.cibleId! }, include: { utilisateur: true } });
  const mention = `<@${cible.utilisateur.discordId}>`;
  const { emoji } = libelle(election);
  const conclure = async (texte: string) => {
    await posterDansMairie(guild, election.villeId, `${emoji} ${texte}`, { mentionnerVille: true });
    await rafraichirPanneau(guild, election.id, texte);
  };

  if (pour <= contre) {
    await conclure(`La ville refuse ${election.type === TypeElection.BANNISSEMENT ? "le bannissement" : "l'exécution"} de ${mention}.`);
    return false;
  }
  if (cible.statut !== StatutJoueur.VIVANT || cible.villeId !== election.villeId || cible.dateSortie !== null) {
    await conclure(`La sentence contre ${mention} est votée, mais il n'est plus un citoyen vivant de la ville : sans effet.`);
    return false;
  }

  if (election.type === TypeElection.BANNISSEMENT) {
    await conclure(await bannir(guild, cible.id));
    return false;
  }
  if (cible.zoneActuelleId !== null) {
    await prisma.joueur.update({ where: { id: cible.id }, data: { executionEnAttente: true } });
    await conclure(`La ville vote l'exécution de ${mention}, qui est dehors : il sera pendu dès qu'il rentrera en ville.`);
    return false;
  }
  await rafraichirPanneau(guild, election.id, `La ville vote l'exécution de ${mention}.`);
  return (await pendre(guild, cible.id)).villeTombee;
}

// Exclusion votee : statut EXCLU, perte du mandat de maire, et s'il est en ville, jete dans une zone proche au hasard
async function bannir(guild: Guild, joueurId: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const ville = joueur.ville!;
  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { statut: StatutJoueur.EXCLU } }),
    ...(ville.maireId === joueurId ? [prisma.ville.update({ where: { id: ville.id }, data: { maireId: null, mandatFinCycle: null } })] : []),
    prisma.journalEntree.create({ data: { villeId: ville.id, joueurId, message: "Banni de la ville par vote" } }),
  ]);
  let lieu = "";
  if (joueur.zoneActuelleId === null && ville.groupeId !== null) {
    const zones = await prisma.zone.findMany({ where: { groupeId: ville.groupeId, palier: PalierZone.PROCHE } });
    const zone = zones[Math.floor(Math.random() * zones.length)];
    if (zone) {
      await deplacerJoueur(guild, joueur, zone.id, 0);
      lieu = ` Il est jeté hors des murs : **${zone.nom}**.`;
    }
  }
  await appliquerExclusionDiscord(guild, joueurId);
  return `La ville bannit <@${joueur.utilisateur.discordId}> : il est exclu et ne peut plus y entrer.${lieu}`;
}

// Pendaison : mort (cause EXECUTION), annoncee dans la mairie
export async function pendre(guild: Guild, joueurId: number): Promise<{ texte: string; villeTombee: boolean }> {
  const joueur = await prisma.joueur.update({
    where: { id: joueurId },
    data: { executionEnAttente: false },
    include: { utilisateur: true },
  });
  // Annonce et journal avant la mort : si c'etait le dernier vivant, la chute efface l'etat de jeu de la ville
  await prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: "Pendu sur décision de la ville" } });
  await posterDansMairie(guild, joueur.villeId!, `🪢 <@${joueur.utilisateur.discordId}> est pendu sur la place publique.`, {
    mentionnerVille: true,
  });
  const villeTombee = await enregistrerMort(guild, joueurId, CauseMort.EXECUTION);
  return { texte: "🪢 La ville avait voté votre exécution : à peine rentré, vous êtes saisi et pendu.", villeTombee };
}
