import { StatutDemande, StatutJoueur, StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import { NOM_METIER } from "../config/metiers";
import { prisma } from "../db";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { estMaireEnExercice } from "./annonce";
import { declarerChuteVille } from "./chute";
import { changerDeVilleDiscord, retablirJoueurDiscord } from "./joueurDiscord";
import { estMjActif, MESSAGE_MJ_ACTIF_NE_JOUE_PAS } from "./permissions";
import { trouverSalonTexte } from "./reconcile";
import { posterDansMairie } from "./villeStructure";

// Demandes d'accueil (conception.md §5) : un survivant dehors (vivant ou exclu) demande a rejoindre une autre ville en jeu
// de son groupe, ou un exclu a revenir dans la sienne (bouton « Demander l'accueil » de /action). La demande est postee
// dans la mairie de la ville visee ; seul son maire l'accepte ou la refuse. Une demande en attente a la fois.
// Accepte : l'exclu est reintegre, ou le survivant change de ville (garde son sac, sa carte, son metier et son PA max,
// equilibrage.md §1 ; perd sa maison et, s'il l'etait, son mandat de maire ; l'ancienne ville tombe s'il en etait le
// dernier vivant). Le demandeur est prevenu dans le salon de sa zone.

const DELAI_FORMULAIRE_MS = 300_000;
const LONGUEUR_MAX_MOTIVATION = 1000;

type JoueurDemandeur = { id: number; statut: StatutJoueur; villeId: number | null; zoneActuelleId: number | null; dateSortie: Date | null };

// Villes ou le joueur peut demander a etre accueilli ; vide s'il ne le peut pas (en ville, mort...)
export async function villesAccueillantes(joueur: JoueurDemandeur) {
  if (joueur.statut !== StatutJoueur.VIVANT && joueur.statut !== StatutJoueur.EXCLU) return [];
  if (joueur.zoneActuelleId === null || joueur.villeId === null || joueur.dateSortie !== null) return [];
  const ville = await prisma.ville.findUnique({ where: { id: joueur.villeId } });
  if (ville?.groupeId == null) return [];
  const villes = await prisma.ville.findMany({ where: { groupeId: ville.groupeId, statut: StatutVille.ACTIVE }, orderBy: { nom: "asc" } });
  // Sa propre ville seulement pour un exclu (retour)
  return villes.filter((v) => v.id !== joueur.villeId || joueur.statut === StatutJoueur.EXCLU);
}

export function demandeEnAttente(joueurId: number) {
  return prisma.demandeAccueil.findFirst({ where: { joueurId, statut: StatutDemande.EN_ATTENTE }, include: { ville: true } });
}

// Formulaire (ville + motivation), puis publication dans la mairie. Renvoie null si le formulaire n'est pas envoye.
export async function formulaireAccueil(
  clic: ButtonInteraction,
  joueurId: number,
): Promise<{ soumission: ModalSubmitInteraction; texte: string } | null> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  const villes = await villesAccueillantes(joueur);
  const idFormulaire = `accueil:${clic.id}`;
  await clic.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle("Demander l'accueil")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Quelle ville ?")
          .setDescription("Seul son maire peut accepter")
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId("ville")
              .setRequired(true)
              .addOptions(
                villes.slice(0, 25).map((v) => ({
                  label: v.id === joueur.villeId ? `${v.nom} (retour dans votre ville)` : v.nom,
                  value: String(v.id),
                })),
              ),
          ),
        new LabelBuilder()
          .setLabel("Motivation")
          .setDescription("Facultatif : affiché avec la demande dans la mairie")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("motivation")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(LONGUEUR_MAX_MOTIVATION),
          ),
      ),
  );
  const soumission = await clic
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return null;
  if (soumission.isFromMessage()) await soumission.deferUpdate();
  const villeId = Number(soumission.fields.getStringSelectValues("ville")[0]);
  const motivation = soumission.fields.getTextInputValue("motivation").trim();
  return { soumission, texte: await demanderAccueil(clic.guild!, joueurId, villeId, motivation) };
}

async function demanderAccueil(guild: Guild, joueurId: number, villeId: number, motivation: string): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { utilisateur: true, ville: true } });
  const ville = (await villesAccueillantes(joueur)).find((v) => v.id === villeId);
  if (!ville) return "Vous ne pouvez plus demander à rejoindre cette ville (il faut être dehors, vivant ou exclu).";
  const enAttente = await demandeEnAttente(joueurId);
  if (enAttente) return `Vous avez déjà une demande en attente auprès de **${enAttente.ville.nom}**.`;

  const demande = await prisma.demandeAccueil.create({ data: { villeId, joueurId, motivation: motivation || null } });
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:mairie`);
  const maire = ville.maireId ? await prisma.joueur.findUnique({ where: { id: ville.maireId }, include: { utilisateur: true } }) : null;
  const message = await salon
    ?.send({
      content: texteDemande(joueur, ville.nom, motivation, maire?.utilisateur.discordId ?? null),
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`accueil:accepter:${demande.id}`).setLabel("Accepter").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`accueil:refuser:${demande.id}`).setLabel("Refuser").setStyle(ButtonStyle.Danger),
        ),
      ],
      allowedMentions: { users: maire ? [maire.utilisateur.discordId] : [] },
    })
    .catch(() => null);
  if (message) await prisma.demandeAccueil.update({ where: { id: demande.id }, data: { messageId: message.id } });
  return `🚪 Votre demande est déposée dans la mairie de **${ville.nom}**. Vous serez prévenu ici dès que le maire aura répondu.`;
}

function texteDemande(
  joueur: { villeId: number | null; statut: StatutJoueur; metier: keyof typeof NOM_METIER | null; utilisateur: { discordId: string }; ville: { nom: string } | null },
  nomVille: string,
  motivation: string,
  maireDiscordId: string | null,
): string {
  const origine =
    joueur.statut === StatutJoueur.EXCLU && joueur.ville?.nom === nomVille
      ? "exclu de cette ville, demande à y revenir"
      : `${joueur.statut === StatutJoueur.EXCLU ? "exclu de" : "citoyen de"} **${joueur.ville?.nom}**, demande à rejoindre **${nomVille}**`;
  return (
    `🚪 <@${joueur.utilisateur.discordId}> (${joueur.metier ? NOM_METIER[joueur.metier] : "sans métier"}), ${origine}.` +
    (motivation ? `\n> ${motivation.replace(/\n/g, "\n> ")}` : "") +
    `\n-# Seul le maire peut répondre${maireDiscordId ? ` : <@${maireDiscordId}>` : " (la ville n'a pas de maire pour l'instant)"}.`
  );
}

// --- Reponse du maire : "accueil:<accepter|refuser>:<demandeId>" ---

export async function gererBoutonAccueil(interaction: ButtonInteraction, action: string, idBrut: string): Promise<void> {
  const demandeId = Number(idBrut);
  if (!interaction.guild || !Number.isInteger(demandeId) || (action !== "accepter" && action !== "refuser")) return;
  const refuser = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  const demande = await prisma.demandeAccueil.findUnique({
    where: { id: demandeId },
    include: { ville: true, joueur: { include: { utilisateur: true, ville: true } } },
  });
  if (demande?.statut !== StatutDemande.EN_ATTENTE) {
    await refuser("Cette demande a déjà été traitée.");
    return;
  }
  if (await estMjActif(interaction.guild, interaction.user.id)) {
    await refuser(MESSAGE_MJ_ACTIF_NE_JOUE_PAS);
    return;
  }
  const maire = await trouverJoueurActif((await trouverOuCreerUtilisateur(interaction.user)).id);
  if (!maire || maire.villeId !== demande.villeId || !estMaireEnExercice(maire)) {
    await refuser("Seul le maire de la ville peut répondre à cette demande.");
    return;
  }

  await interaction.deferUpdate();
  const demandeur = `<@${demande.joueur.utilisateur.discordId}>`;
  const valable = (await villesAccueillantes(demande.joueur)).some((v) => v.id === demande.villeId);
  let bilan: string;
  if (!valable) {
    await prisma.demandeAccueil.update({ where: { id: demandeId }, data: { statut: StatutDemande.ANNULEE, dateReponse: new Date() } });
    bilan = `❌ La demande de ${demandeur} n'est plus valable (il n'est plus dehors, ou plus en vie).`;
  } else if (action === "refuser") {
    await prisma.demandeAccueil.update({ where: { id: demandeId }, data: { statut: StatutDemande.REFUSEE, dateReponse: new Date() } });
    bilan = `❌ Le maire refuse d'accueillir ${demandeur}.`;
    await prevenirDemandeur(interaction.guild, demande.joueur, `❌ ${demandeur}, le maire de **${demande.ville.nom}** refuse votre demande.`);
  } else {
    bilan = await accueillir(interaction.guild, demandeId);
  }
  await interaction.editReply({ content: `${interaction.message.content}\n\n${bilan}`, components: [], allowedMentions: { parse: [] } });
}

async function prevenirDemandeur(guild: Guild, joueur: { zoneActuelleId: number | null }, texte: string): Promise<void> {
  if (joueur.zoneActuelleId === null) return;
  const salon = await trouverSalonTexte(guild, `salon:zone:${joueur.zoneActuelleId}`);
  await salon?.send({ content: texte, allowedMentions: { parse: ["users"] } }).catch(() => null);
}

async function accueillir(guild: Guild, demandeId: number): Promise<string> {
  const demande = await prisma.demandeAccueil.findUniqueOrThrow({
    where: { id: demandeId },
    include: { ville: true, joueur: { include: { utilisateur: true, ville: true } } },
  });
  const joueur = demande.joueur;
  const ancienne = joueur.ville!;
  const mention = `<@${joueur.utilisateur.discordId}>`;
  const fermerDemandes = prisma.demandeAccueil.updateMany({
    where: { joueurId: joueur.id, statut: StatutDemande.EN_ATTENTE },
    data: { statut: StatutDemande.ANNULEE, dateReponse: new Date() },
  });
  const accepter = prisma.demandeAccueil.update({ where: { id: demandeId }, data: { statut: StatutDemande.ACCEPTEE, dateReponse: new Date() } });

  // Retour d'un exclu dans sa ville
  if (ancienne.id === demande.villeId) {
    await prisma.$transaction([
      fermerDemandes,
      accepter,
      prisma.joueur.update({ where: { id: joueur.id }, data: { statut: StatutJoueur.VIVANT } }),
      prisma.journalEntree.create({ data: { villeId: ancienne.id, joueurId: joueur.id, message: "Réintégré dans la ville par le maire" } }),
    ]);
    await retablirJoueurDiscord(guild, joueur.id);
    await posterDansMairie(guild, ancienne.id, `🚪 Le maire réintègre ${mention} dans la ville.`);
    await prevenirDemandeur(guild, joueur, `✅ ${mention}, le maire de **${ancienne.nom}** vous réintègre : vous pouvez rentrer en ville.`);
    return `✅ Le maire réintègre ${mention}.`;
  }

  // Changement de ville : le personnage garde son sac, sa carte, son metier et son PA max ; sa maison reste derriere lui
  await prisma.$transaction([
    fermerDemandes,
    accepter,
    prisma.contributionMaison.deleteMany({ where: { joueurId: joueur.id } }),
    prisma.joueur.update({
      where: { id: joueur.id },
      data: { villeId: demande.villeId, statut: StatutJoueur.VIVANT, executionEnAttente: false, maisonPalier: 0, maisonPaInstalles: 0 },
    }),
    ...(ancienne.maireId === joueur.id ? [prisma.ville.update({ where: { id: ancienne.id }, data: { maireId: null, mandatFinCycle: null } })] : []),
    prisma.journalEntree.create({ data: { villeId: ancienne.id, joueurId: joueur.id, message: `Parti rejoindre ${demande.ville.nom}` } }),
    prisma.journalEntree.create({ data: { villeId: demande.villeId, joueurId: joueur.id, message: `Accueilli, venu de ${ancienne.nom}` } }),
  ]);
  await changerDeVilleDiscord(guild, joueur.id, ancienne.id);
  await posterDansMairie(guild, demande.villeId, `🚪 Le maire accueille ${mention}, venu de **${ancienne.nom}** : bienvenue parmi nous !`);
  await prevenirDemandeur(guild, joueur, `✅ ${mention}, le maire de **${demande.ville.nom}** vous accueille : c'est désormais votre ville.`);

  if (ancienne.statut === StatutVille.ACTIVE) {
    await posterDansMairie(guild, ancienne.id, `🚪 ${mention} a quitté **${ancienne.nom}** pour rejoindre **${demande.ville.nom}**.`);
    const survivants = await prisma.joueur.count({ where: { villeId: ancienne.id, statut: StatutJoueur.VIVANT, dateSortie: null } });
    if (survivants === 0) await declarerChuteVille(guild, ancienne.id);
  }
  return `✅ Le maire accueille ${mention} dans **${demande.ville.nom}**.`;
}
