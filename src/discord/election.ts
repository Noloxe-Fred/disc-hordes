import { StatutElection, StatutJoueur, StatutVille, TypeElection, type Election } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import { CYCLES_PAR_MANDAT_MAIRE } from "../config/metiers";
import { DUREE_CANDIDATURES_HEURES, DUREE_VOTE_HEURES } from "../config/politique";
import { prisma } from "../db";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { estMjActif, MESSAGE_MJ_ACTIF_NE_JOUE_PAS } from "./permissions";
import { trouverSalonTexte } from "./reconcile";
import { posterDansMairie } from "./villeStructure";

// Election du maire (conception.md §5) : declenchable a tout moment par un citoyen vivant (bouton « Élection » de
// /action), une seule a la fois par ville. Un panneau poste dans la mairie porte les boutons : 24 h de candidatures
// (citoyens vivants, ou qu'ils soient), puis 24 h de vote (citoyens vivants presents en ville, vote modifiable
// jusqu'a la cloture). Candidat unique elu d'office ; aucun candidat ou aucune voix : sans effet. Egalite : le plus
// d'XP l'emporte, sinon revote de 24 h entre les ex aequo. L'elu recoit un mandat de 4 cycles a partir du cycle
// courant ; le maire en place garde sa fonction jusqu'au resultat. Echeances verifiees par verifierElections
// (scheduler/cycle.ts), avancables depuis /admin (« Forcer une élection »).
// Fin de mandat (T46) : a l'aube qui depasse mandatFinCycle, le maire passe en interim (mandatFinCycle a null) et
// une election s'ouvre, sauf s'il y en a deja une ; sans elu, l'interim prend fin et la ville reste sans maire.
// Mairie liberee en cours de mandat (mort, depart, bannissement, exclusion, destitution) : election ouverte aussitot.

const COULEUR = 0x8e44ad;
const COULEUR_TERMINEE = 0x7f8c8d;
const DELAI_FORMULAIRE_MS = 180_000;
const HEURE_MS = 3_600_000;

export function electionEnCours(villeId: number) {
  return prisma.election.findFirst({ where: { villeId, type: TypeElection.MAIRE, statut: StatutElection.EN_COURS } });
}

function finDuVote(election: Election): Date {
  return new Date(election.dateVote.getTime() + DUREE_VOTE_HEURES * HEURE_MS);
}

export function horodatage(date: Date): string {
  const secondes = Math.floor(date.getTime() / 1000);
  return `<t:${secondes}:f> (<t:${secondes}:R>)`;
}

// Candidats encore eligibles : vivants (ni morts ni exclus) et toujours dans la ville
function candidatsEligibles(electionId: number, villeId: number) {
  return prisma.candidature.findMany({
    where: { electionId, joueur: { villeId, statut: StatutJoueur.VIVANT, dateSortie: null } },
    include: { joueur: { include: { utilisateur: true } } },
    orderBy: { id: "asc" },
  });
}

// --- Panneau de la mairie ---

async function construirePanneau(electionId: number, resultat?: string): Promise<ContainerBuilder> {
  const election = await prisma.election.findUniqueOrThrow({ where: { id: electionId }, include: { ville: true } });
  const candidats = await candidatsEligibles(election.id, election.villeId);
  const terminee = election.statut === StatutElection.TERMINEE;
  const titre = `## 🗳️ Élection du maire — ${election.ville.nom}` + (election.tour > 1 ? ` (revote, tour ${election.tour})` : "");

  let etape: string;
  if (terminee) {
    etape = resultat ?? "L'élection est terminée.";
  } else if (!election.voteOuvert) {
    etape =
      `**Candidatures** ouvertes jusqu'au ${horodatage(election.dateVote)}. Tout citoyen vivant peut se présenter, ` +
      `où qu'il soit. Le vote durera ensuite ${DUREE_VOTE_HEURES} h.`;
  } else {
    const votants = await prisma.vote.count({ where: { electionId } });
    etape =
      `**Vote** ouvert jusqu'au ${horodatage(finDuVote(election))}. Seuls les citoyens vivants **présents en ville** votent ; ` +
      `vous pouvez changer d'avis jusqu'à la clôture.\n🗳️ ${votants} vote${votants > 1 ? "s" : ""} déposé${votants > 1 ? "s" : ""}.`;
  }

  const liste =
    candidats.length === 0
      ? "_Aucun candidat pour l'instant._"
      : candidats.map((c) => `• <@${c.joueur.utilisateur.discordId}>` + (terminee && election.voteOuvert ? ` — ${c.votes} voix` : "")).join("\n");
  const panneau = new ContainerBuilder()
    .setAccentColor(terminee ? COULEUR_TERMINEE : COULEUR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${titre}\n${etape}\n\n**Candidats**\n${liste}`));
  if (terminee) return panneau;

  const boutons = election.voteOuvert
    ? [new ButtonBuilder().setCustomId(`election:voter:${electionId}`).setLabel("Voter").setEmoji("🗳️").setStyle(ButtonStyle.Primary)]
    : [
        new ButtonBuilder()
          .setCustomId(`election:candidater:${electionId}`)
          .setLabel("Se porter candidat")
          .setEmoji("🙋")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`election:retirer:${electionId}`)
          .setLabel("Retirer ma candidature")
          .setStyle(ButtonStyle.Secondary),
      ];
  return panneau.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(boutons));
}

// Poste le panneau dans la mairie, ou le met a jour s'il existe deja
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

// Conditions pour declencher une election ; null si tout va bien
export async function empechementElection(joueurId: number): Promise<string | null> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  if (joueur.statut !== StatutJoueur.VIVANT) return "Seuls les citoyens vivants peuvent déclencher une élection.";
  if (joueur.ville?.statut !== StatutVille.ACTIVE) return "Votre ville n'est pas en jeu.";
  if (await electionEnCours(joueur.ville.id)) return "🗳️ Une élection est déjà en cours : son panneau est dans la mairie.";
  return null;
}

export async function declencherElectionJoueur(guild: Guild, joueurId: number): Promise<string> {
  const raison = await empechementElection(joueurId);
  if (raison) return raison;
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { utilisateur: true } });
  await ouvrirElection(guild, joueur.villeId!, `<@${joueur.utilisateur.discordId}> déclenche une élection du maire.`, joueurId);
  return (
    `🗳️ L'élection est lancée : ${DUREE_CANDIDATURES_HEURES} h de candidatures puis ${DUREE_VOTE_HEURES} h de vote. ` +
    "Le panneau est dans la mairie."
  );
}

// Ouvre l'election d'une ville (par un citoyen ou depuis /admin) : annonce dans la mairie puis panneau
export async function ouvrirElection(guild: Guild, villeId: number, annonce: string, joueurId: number | null = null): Promise<void> {
  const election = await prisma.election.create({
    data: {
      villeId,
      type: TypeElection.MAIRE,
      dateVote: new Date(Date.now() + DUREE_CANDIDATURES_HEURES * HEURE_MS),
    },
  });
  await prisma.journalEntree.create({ data: { villeId, joueurId, message: "Élection du maire déclenchée" } });
  await posterDansMairie(
    guild,
    villeId,
    `🗳️ ${annonce} Candidatures ouvertes jusqu'au ${horodatage(election.dateVote)}, avec le panneau ci-dessous.`,
    { mentionnerVille: true },
  );
  await rafraichirPanneau(guild, election.id);
}

// Mairie liberee en cours de partie : election ouverte aussitot, sauf si une election est deja en cours (elle
// designera le successeur) ou si la ville n'est plus en jeu
export async function pourvoirMairieVacante(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.findUnique({ where: { id: villeId } });
  if (ville?.statut !== StatutVille.ACTIVE || ville.maireId !== null) return;
  if (await electionEnCours(villeId)) return;
  await ouvrirElection(guild, villeId, "La mairie est vacante : une élection du maire s'ouvre automatiquement.");
}

// Fin de mandat, verifiee a l'aube : le maire assure l'interim jusqu'au resultat de l'election (ouverte ici, ou
// deja en cours). mandatFinCycle a null avec un maire marque l'interim, pour n'annoncer la fin qu'une fois.
export async function verifierFinMandat(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: villeId }, include: { maire: { include: { utilisateur: true } } } });
  if (!ville.maire || ville.mandatFinCycle === null || ville.cycleActuel <= ville.mandatFinCycle) return;
  await prisma.$transaction([
    prisma.ville.update({ where: { id: villeId }, data: { mandatFinCycle: null } }),
    prisma.journalEntree.create({ data: { villeId, joueurId: ville.maire.id, message: "Fin du mandat de maire, intérim jusqu'à l'élection" } }),
  ]);
  const texte = `Le mandat de <@${ville.maire.utilisateur.discordId}> s'achève : il assure l'intérim jusqu'au résultat de l'élection`;
  if (await electionEnCours(villeId)) {
    await posterDansMairie(guild, villeId, `🏛️ ${texte} en cours.`, { mentionnerVille: true });
    return;
  }
  await ouvrirElection(guild, villeId, `${texte}.`);
}

// --- Boutons du panneau : "election:<candidater|retirer|voter>:<electionId>" ---

export async function gererBoutonElection(interaction: ButtonInteraction, action: string, idBrut: string): Promise<void> {
  const electionId = Number(idBrut);
  if (!interaction.guild || !Number.isInteger(electionId)) return;
  const refuser = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (election?.statut !== StatutElection.EN_COURS) {
    await refuser("Cette élection est terminée.");
    return;
  }
  if (await estMjActif(interaction.guild, interaction.user.id)) {
    await refuser(MESSAGE_MJ_ACTIF_NE_JOUE_PAS);
    return;
  }
  const joueur = await trouverJoueurActif((await trouverOuCreerUtilisateur(interaction.user)).id);
  if (!joueur || joueur.villeId !== election.villeId) {
    await refuser("Cette élection n'est pas celle de votre ville.");
    return;
  }
  if (joueur.statut !== StatutJoueur.VIVANT) {
    await refuser("Seuls les citoyens vivants prennent part à l'élection.");
    return;
  }

  if (action === "candidater" || action === "retirer") {
    if (election.voteOuvert) {
      await refuser("Les candidatures sont closes : le vote est en cours.");
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(action === "candidater" ? await candidater(election, joueur.id) : await retirer(election, joueur.id));
    await rafraichirPanneau(interaction.guild, election.id);
  } else if (action === "voter") {
    if (!election.voteOuvert) {
      await refuser(`Le vote n'est pas encore ouvert : il commence le ${horodatage(election.dateVote)}.`);
      return;
    }
    if (joueur.zoneActuelleId !== null) {
      await refuser("Seuls les citoyens présents en ville votent : rentrez en ville pour voter.");
      return;
    }
    await formulaireVote(interaction, election, joueur.id);
  }
}

async function candidater(election: Election, joueurId: number): Promise<string> {
  const existante = await prisma.candidature.findUnique({ where: { electionId_joueurId: { electionId: election.id, joueurId } } });
  if (existante) return "Vous êtes déjà candidat.";
  await prisma.$transaction([
    prisma.candidature.create({ data: { electionId: election.id, joueurId } }),
    prisma.journalEntree.create({ data: { villeId: election.villeId, joueurId, message: "Candidature à l'élection du maire" } }),
  ]);
  return `🙋 Vous êtes candidat. Le vote s'ouvrira le ${horodatage(election.dateVote)}.`;
}

async function retirer(election: Election, joueurId: number): Promise<string> {
  const { count } = await prisma.candidature.deleteMany({ where: { electionId: election.id, joueurId } });
  if (count === 0) return "Vous n'êtes pas candidat.";
  await prisma.journalEntree.create({ data: { villeId: election.villeId, joueurId, message: "Candidature à l'élection du maire retirée" } });
  return "Votre candidature est retirée.";
}

async function formulaireVote(interaction: ButtonInteraction, election: Election, joueurId: number): Promise<void> {
  const candidats = await candidatsEligibles(election.id, election.villeId);
  if (candidats.length === 0) {
    await interaction.reply({ content: "Il n'y a plus aucun candidat en lice.", flags: MessageFlags.Ephemeral });
    return;
  }
  const precedent = await prisma.vote.findUnique({ where: { electionId_votantId: { electionId: election.id, votantId: joueurId } } });
  const idFormulaire = `election:${interaction.id}`;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle("Élection du maire")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Votre candidat")
          .setDescription("Vote secret, modifiable jusqu'à la clôture")
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId("candidat")
              .setRequired(true)
              .addOptions(
                candidats.slice(0, 25).map((c) => ({
                  label: (c.joueur.utilisateur.pseudoCache ?? c.joueur.utilisateur.discordId).slice(0, 100),
                  value: String(c.joueurId),
                  default: precedent?.candidatId === c.joueurId,
                })),
              ),
          ),
      ),
  );
  const soumission = await interaction
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return;
  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const candidatId = Number(soumission.fields.getStringSelectValues("candidat")[0]);
  await soumission.editReply({ content: await voter(election.id, joueurId, candidatId), allowedMentions: { parse: [] } });
  await rafraichirPanneau(interaction.guild!, election.id);
}

// Vote : tout est reverifie, le formulaire ayant pu rester ouvert pendant la cloture ou un depart
async function voter(electionId: number, joueurId: number, candidatId: number): Promise<string> {
  const election = await prisma.election.findUniqueOrThrow({ where: { id: electionId } });
  if (election.statut !== StatutElection.EN_COURS || !election.voteOuvert) return "Le vote est clos.";
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  if (joueur.statut !== StatutJoueur.VIVANT || joueur.villeId !== election.villeId || joueur.dateSortie !== null) {
    return "Seuls les citoyens vivants de la ville votent.";
  }
  if (joueur.zoneActuelleId !== null) return "Seuls les citoyens présents en ville votent : rentrez en ville pour voter.";
  const candidat = (await candidatsEligibles(electionId, election.villeId)).find((c) => c.joueurId === candidatId);
  if (!candidat) return "Ce candidat n'est plus en lice.";

  await prisma.vote.upsert({
    where: { electionId_votantId: { electionId, votantId: joueurId } },
    update: { candidatId, dateVote: new Date() },
    create: { electionId, votantId: joueurId, candidatId },
  });
  return `🗳️ Votre vote pour <@${candidat.joueur.utilisateur.discordId}> est enregistré. Vous pouvez en changer jusqu'à la clôture.`;
}

// --- Echeances : fin des candidatures, puis depouillement ---

export async function verifierElections(guild: Guild): Promise<void> {
  const maintenant = Date.now();
  const elections = await prisma.election.findMany({
    where: { type: TypeElection.MAIRE, statut: StatutElection.EN_COURS, ville: { statut: StatutVille.ACTIVE } },
  });
  for (const election of elections) {
    const echeance = election.voteOuvert ? finDuVote(election) : election.dateVote;
    if (echeance.getTime() > maintenant) continue;
    await avancerElection(guild, election).catch((error) => console.error(`Échéance de l'élection ${election.id}`, error));
  }
}

// Passe a l'etape suivante sans attendre l'echeance (aussi pour le panneau /admin) ; renvoie ce qui s'est passe
export async function avancerElection(guild: Guild, election: Election): Promise<string> {
  return election.voteOuvert ? depouiller(guild, election) : cloreCandidatures(guild, election);
}

async function cloreCandidatures(guild: Guild, election: Election): Promise<string> {
  const candidats = await candidatsEligibles(election.id, election.villeId);
  if (candidats.length >= 2) {
    // Garde contre une double cloture (verification periodique et /admin en meme temps)
    const { count } = await prisma.election.updateMany({
      where: { id: election.id, statut: StatutElection.EN_COURS, voteOuvert: false },
      data: { voteOuvert: true, dateVote: new Date() },
    });
    if (count === 0) return "L'élection a déjà avancé entre-temps.";
    const ouverte = await prisma.election.findUniqueOrThrow({ where: { id: election.id } });
    await posterDansMairie(
      guild,
      election.villeId,
      `🗳️ Les candidatures sont closes : ${candidats.length} candidats. **Le vote est ouvert** jusqu'au ${horodatage(finDuVote(ouverte))}, ` +
        "pour les citoyens présents en ville, avec le panneau de l'élection.",
      { mentionnerVille: true },
    );
    await rafraichirPanneau(guild, election.id);
    return `Le vote est ouvert entre ${candidats.length} candidats.`;
  }

  if (!(await terminer(election.id, false))) return "L'élection a déjà avancé entre-temps.";
  if (candidats.length === 0) return sansEffet(guild, election, "Aucun candidat ne s'est présenté : l'élection est sans effet.");
  const elu = candidats[0].joueur;
  return elire(guild, election, elu.id, `<@${elu.utilisateur.discordId}>, seul candidat, est élu d'office.`);
}

async function depouiller(guild: Guild, election: Election): Promise<string> {
  if (!(await terminer(election.id, true))) return "L'élection a déjà été dépouillée entre-temps.";
  const candidats = await candidatsEligibles(election.id, election.villeId);
  const votes = await prisma.vote.findMany({ where: { electionId: election.id } });
  const decompte = candidats.map((c) => ({ ...c, votes: votes.filter((v) => v.candidatId === c.joueurId).length }));
  for (const c of decompte) await prisma.candidature.update({ where: { id: c.id }, data: { votes: c.votes } });

  const meilleur = Math.max(0, ...decompte.map((c) => c.votes));
  if (meilleur === 0) return sansEffet(guild, election, "Aucune voix exprimée pour un candidat en lice : l'élection est sans effet.");
  const exAequo = decompte.filter((c) => c.votes === meilleur);
  const voix = `${meilleur} voix`;
  if (exAequo.length === 1) {
    return elire(guild, election, exAequo[0].joueurId, `<@${exAequo[0].joueur.utilisateur.discordId}> est élu avec ${voix}.`);
  }

  // Egalite : le plus d'XP l'emporte, sinon revote entre les ex aequo
  const xpMax = Math.max(...exAequo.map((c) => c.joueur.xp));
  const departages = exAequo.filter((c) => c.joueur.xp === xpMax);
  if (departages.length === 1) {
    const elu = departages[0];
    return elire(guild, election, elu.joueurId, `<@${elu.joueur.utilisateur.discordId}> est élu : égalité à ${voix}, départagée par l'expérience.`);
  }

  const mentions = departages.map((c) => `<@${c.joueur.utilisateur.discordId}>`).join(", ");
  const texte = `Égalité à ${voix} entre ${mentions} : revote de ${DUREE_VOTE_HEURES} h entre eux.`;
  await rafraichirPanneau(guild, election.id, texte);
  const revote = await prisma.election.create({
    data: {
      villeId: election.villeId,
      type: TypeElection.MAIRE,
      dateVote: new Date(),
      voteOuvert: true,
      tour: election.tour + 1,
      candidatures: { create: departages.map((c) => ({ joueurId: c.joueurId })) },
    },
  });
  await posterDansMairie(
    guild,
    election.villeId,
    `🗳️ ${texte} Vote ouvert jusqu'au ${horodatage(finDuVote(revote))}, avec le nouveau panneau ci-dessous.`,
    { mentionnerVille: true },
  );
  await rafraichirPanneau(guild, revote.id);
  return texte;
}

// Election sans elu : le maire en place le reste, sauf un maire en interim (mandat echu), qui quitte la mairie. Pas de
// nouvelle election automatique : un citoyen peut en declencher une.
async function sansEffet(guild: Guild, election: Election, texte: string): Promise<string> {
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: election.villeId }, include: { maire: { include: { utilisateur: true } } } });
  let resultat = texte;
  if (ville.maire && ville.mandatFinCycle === null) {
    await prisma.$transaction([
      prisma.ville.update({ where: { id: ville.id }, data: { maireId: null } }),
      prisma.journalEntree.create({ data: { villeId: ville.id, joueurId: ville.maire.id, message: "Fin de l'intérim de maire, sans successeur" } }),
    ]);
    resultat +=
      ` Faute de successeur, l'intérim de <@${ville.maire.utilisateur.discordId}> prend fin : la ville est sans maire. ` +
      "Tout citoyen vivant peut déclencher une nouvelle élection.";
  }
  await posterDansMairie(guild, ville.id, `🗳️ ${resultat}`);
  await rafraichirPanneau(guild, election.id, resultat);
  return resultat;
}

// Passe l'election a TERMINEE si elle en est bien a l'etape attendue ; false si une autre cloture l'a devancee
async function terminer(electionId: number, voteOuvert: boolean): Promise<boolean> {
  const { count } = await prisma.election.updateMany({
    where: { id: electionId, statut: StatutElection.EN_COURS, voteOuvert },
    data: { statut: StatutElection.TERMINEE },
  });
  return count === 1;
}

// Nouveau maire : mandat de 4 cycles a partir du cycle courant, meme s'il etait deja maire
async function elire(guild: Guild, election: Election, joueurId: number, texte: string): Promise<string> {
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: election.villeId } });
  const mandatFinCycle = ville.cycleActuel + CYCLES_PAR_MANDAT_MAIRE - 1;
  await prisma.$transaction([
    prisma.ville.update({ where: { id: ville.id }, data: { maireId: joueurId, mandatFinCycle } }),
    prisma.journalEntree.create({ data: { villeId: ville.id, joueurId, message: "Élu maire" } }),
  ]);
  const resultat = `${texte} Mandat de ${CYCLES_PAR_MANDAT_MAIRE} cycles, jusqu'au cycle ${mandatFinCycle}.`;
  await posterDansMairie(guild, ville.id, `🏛️ ${resultat}`, { mentionnerVille: true });
  await rafraichirPanneau(guild, election.id, resultat);
  return resultat;
}
