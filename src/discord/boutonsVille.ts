import { Metier, StatutDemande, StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import {
  CYCLES_PAR_MANDAT_MAIRE,
  GROUPES_VILLES_MAX,
  JOUEURS_MAX_PAR_VILLE,
  JOUEURS_MIN_FONDATION,
  NOM_METIER,
  PA_CIBLE_VILLE,
  PA_MAX_PLAFOND,
  PLACES_PAR_METIER,
  PLACES_SANS_METIER,
} from "../config/metiers";
import { prisma } from "../db";
import { utilisateurEstEngage } from "../services/engagement";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { rafraichirMessageVille, supprimerMessagesRecrutement } from "./messageVille";
import { estMjOuAdmin } from "./permissions";
import { trouverRole, trouverSalonTexte } from "./reconcile";
import { ROLE_CITOYEN, ROLE_MORT, ROLE_NOMADE, SALON_NOUVEL_ARRIVANT } from "./structure";
import { ensureTerritoiresGroupe } from "./territoires";
import { DELAI_FORMULAIRE_MS, LONGUEUR_MAX_TEXTE_LIBRE, enCitation } from "./texteLibre";
import { creerStructureVille } from "./villeStructure";

// Boutons du message de recrutement d'une ville (messageVille.ts) : customId "ville:<action>:<villeId>"

const VALEUR_SANS_METIER = "AUCUN";
const DELAI_SELECTION_MS = 120_000;
const DELAI_CONFIRMATION_MS = 30_000;

async function repondre(interaction: ButtonInteraction, content: string) {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function villeEnCreation(villeId: number) {
  const ville = await prisma.ville.findUnique({ where: { id: villeId } });
  return ville?.statut === StatutVille.EN_CREATION ? ville : null;
}

// --- Rejoindre : choix du metier, formulaire de motivations, demande dans #nouvel-arrivant ---

async function rejoindre(interaction: ButtonInteraction, guild: Guild, villeId: number) {
  const utilisateur = await trouverOuCreerUtilisateur(interaction.user);

  if (await utilisateurEstEngage(utilisateur.id)) {
    await repondre(interaction, "Vous êtes déjà engagé dans une ville, ou une de vos demandes est encore en attente.");
    return;
  }

  const ville = await prisma.ville.findUnique({ where: { id: villeId }, include: { habitants: true, createur: true } });
  if (ville?.statut !== StatutVille.EN_CREATION) {
    await repondre(interaction, "Cette ville n'accepte plus d'inscriptions.");
    return;
  }
  if (ville.habitants.length >= JOUEURS_MAX_PAR_VILLE) {
    await repondre(interaction, `**${ville.nom}** a déjà atteint ${JOUEURS_MAX_PAR_VILLE} habitants.`);
    return;
  }

  const occupation = new Map<Metier, number>();
  for (const habitant of ville.habitants) {
    if (habitant.metier) occupation.set(habitant.metier, (occupation.get(habitant.metier) ?? 0) + 1);
  }
  const sansMetierPris = ville.habitants.filter((h) => !h.metier).length;
  const optionsMetier = [
    ...(sansMetierPris < PLACES_SANS_METIER ? [{ label: "Simple citoyen (sans métier)", value: VALEUR_SANS_METIER }] : []),
    ...Object.values(Metier)
      .filter((m) => (occupation.get(m) ?? 0) < PLACES_PAR_METIER[m])
      .map((m) => ({ label: NOM_METIER[m], value: m })),
  ];
  if (optionsMetier.length === 0) {
    await repondre(interaction, `**${ville.nom}** est complète (tous les métiers et places libres sont pris).`);
    return;
  }

  const reponse = await interaction.reply({
    content: `Rejoindre **${ville.nom}** : choisissez votre métier.`,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId("choix-metier").setPlaceholder("Choisissez un métier").addOptions(optionsMetier),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });

  const selectionMetier = await reponse
    .awaitMessageComponent({ componentType: ComponentType.StringSelect, time: DELAI_SELECTION_MS })
    .catch(() => null);
  if (!selectionMetier) {
    await interaction.editReply({ content: "Délai dépassé, demande annulée.", components: [] });
    return;
  }

  const metierChoisi = selectionMetier.values[0] === VALEUR_SANS_METIER ? null : (selectionMetier.values[0] as Metier);

  const idFormulaire = `motivation:${selectionMetier.id}`;
  await selectionMetier.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle(`Rejoindre ${ville.nom}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("motivation")
            .setLabel("Vos motivations")
            .setPlaceholder("Pourquoi cette ville ? Votre style de jeu, vos disponibilités... (facultatif)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(LONGUEUR_MAX_TEXTE_LIBRE),
        ),
      ),
  );

  const soumission = await selectionMetier
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) {
    await interaction.editReply({ content: "Formulaire non envoyé, demande annulée.", components: [] }).catch(() => null);
    return;
  }

  const motivation = soumission.fields.getTextInputValue("motivation").trim() || null;

  // Reverifications : la saisie peut durer plusieurs minutes
  if (!(await villeEnCreation(ville.id))) {
    await soumission.reply({ content: `**${ville.nom}** n'accepte plus d'inscriptions.`, flags: MessageFlags.Ephemeral });
    await interaction.editReply({ components: [] }).catch(() => null);
    return;
  }
  if (await utilisateurEstEngage(utilisateur.id)) {
    await soumission.reply({
      content: "Vous êtes déjà engagé dans une ville, ou une de vos demandes est encore en attente.",
      flags: MessageFlags.Ephemeral,
    });
    await interaction.editReply({ components: [] }).catch(() => null);
    return;
  }

  const demande = await prisma.demandeInscription.create({
    data: { villeId: ville.id, utilisateurId: utilisateur.id, metierDemande: metierChoisi ?? undefined, motivation },
  });

  const salon = await trouverSalonTexte(guild, SALON_NOUVEL_ARRIVANT.cle);
  if (salon) {
    const message = await salon.send({
      content:
        `<@${ville.createur.discordId}> — ${interaction.user} demande à rejoindre **${ville.nom}** ` +
        `(métier : ${metierChoisi ? NOM_METIER[metierChoisi] : "sans métier"}).` +
        (motivation ? `\n\n**Motivations :**\n${enCitation(motivation)}` : ""),
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`demande:accepter:${demande.id}`).setLabel("Accepter").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`demande:refuser:${demande.id}`).setLabel("Refuser").setStyle(ButtonStyle.Danger),
        ),
      ],
      // Seuls le createur et le joueur sont notifies, quel que soit le contenu des motivations
      allowedMentions: { users: [ville.createur.discordId, interaction.user.id] },
    });
    await prisma.demandeInscription.update({ where: { id: demande.id }, data: { messageId: message.id } });
  }

  const confirmation = {
    content:
      `Demande envoyée pour rejoindre **${ville.nom}**. En attente de validation par le créateur ` +
      `(bouton « Quitter la ville » pour la retirer).` +
      (salon ? "" : " (Salon #nouvel-arrivant introuvable : un admin doit lancer /init.)"),
    components: [],
  };
  if (soumission.isFromMessage()) await soumission.update(confirmation);
  else await soumission.reply({ ...confirmation, flags: MessageFlags.Ephemeral });
}

// --- Quitter : depart d'un inscrit, ou retrait d'une demande en attente ---

async function quitter(interaction: ButtonInteraction, guild: Guild, villeId: number) {
  const ville = await villeEnCreation(villeId);
  if (!ville) {
    await repondre(interaction, "Cette ville n'est plus en cours de création.");
    return;
  }

  const utilisateur = await trouverOuCreerUtilisateur(interaction.user);
  if (ville.createurUtilisateurId === utilisateur.id) {
    await repondre(interaction, "Vous êtes le créateur de cette ville : utilisez « Annuler la ville » pour l'abandonner.");
    return;
  }

  const joueur = await prisma.joueur.findFirst({ where: { villeId, utilisateurId: utilisateur.id } });
  if (joueur) {
    await prisma.joueur.delete({ where: { id: joueur.id } });
    await rafraichirMessageVille(guild, villeId);
    await repondre(interaction, `Vous avez quitté **${ville.nom}**.`);
    return;
  }

  const demande = await prisma.demandeInscription.findFirst({
    where: { villeId, utilisateurId: utilisateur.id, statut: StatutDemande.EN_ATTENTE },
  });
  if (demande) {
    await prisma.demandeInscription.update({
      where: { id: demande.id },
      data: { statut: StatutDemande.ANNULEE, dateReponse: new Date() },
    });
    if (demande.messageId) {
      const salon = await trouverSalonTexte(guild, SALON_NOUVEL_ARRIVANT.cle);
      const message = await salon?.messages.fetch(demande.messageId).catch(() => null);
      await message?.delete().catch(() => null);
    }
    await repondre(interaction, `Votre demande pour rejoindre **${ville.nom}** a été retirée.`);
    return;
  }

  await repondre(interaction, `Vous n'êtes pas inscrit à **${ville.nom}**.`);
}

// --- Annuler : createur ou MJ/Admin, avec confirmation (conception.md, commandes admin) ---

async function annuler(interaction: ButtonInteraction, guild: Guild, villeId: number) {
  const ville = await prisma.ville.findUnique({ where: { id: villeId }, include: { createur: true } });
  if (ville?.statut !== StatutVille.EN_CREATION) {
    await repondre(interaction, "Cette ville n'est plus en cours de création.");
    return;
  }
  if (ville.createur.discordId !== interaction.user.id && !(await estMjOuAdmin(guild, interaction.user.id))) {
    await repondre(interaction, "Seul le créateur de la ville (ou un MJ/Admin) peut l'annuler.");
    return;
  }

  const reponse = await interaction.reply({
    content: `Annuler **${ville.nom}** ? Les inscriptions et les demandes en attente seront supprimées.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("confirmer").setLabel("Confirmer l'annulation").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("garder").setLabel("Garder la ville").setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });

  const choix = await reponse
    .awaitMessageComponent({ componentType: ComponentType.Button, time: DELAI_CONFIRMATION_MS })
    .catch(() => null);
  if (choix?.customId !== "confirmer") {
    const abandon = { content: "Annulation abandonnée.", components: [] };
    if (choix) await choix.update(abandon);
    else await interaction.editReply(abandon).catch(() => null);
    return;
  }

  // La ville a pu etre fondee pendant la confirmation
  if (!(await villeEnCreation(villeId))) {
    await choix.update({ content: "Cette ville n'est plus en cours de création.", components: [] });
    return;
  }

  await supprimerMessagesRecrutement(guild, villeId);
  // Aucun role n'est attribue avant la fondation : rien a retirer aux inscrits
  await prisma.$transaction([
    prisma.joueur.deleteMany({ where: { villeId } }),
    prisma.ville.delete({ where: { id: villeId } }), // demandes supprimees en cascade
  ]);

  await choix.update({ content: `**${ville.nom}** a été annulée.`, components: [] });
}

// --- Fonder : createur, minimum d'habitants sauf MJ/Admin (equilibrage.md §1) ---

async function fonder(interaction: ButtonInteraction, guild: Guild, villeId: number) {
  const ville = await prisma.ville.findUnique({
    where: { id: villeId },
    include: { createur: true, habitants: { include: { utilisateur: true } } },
  });
  if (ville?.statut !== StatutVille.EN_CREATION) {
    await repondre(interaction, "Cette ville n'est plus en cours de création.");
    return;
  }
  if (ville.createur.discordId !== interaction.user.id) {
    await repondre(interaction, "Seul le créateur de la ville peut la fonder.");
    return;
  }

  const nombreHabitants = ville.habitants.length;
  if (nombreHabitants < JOUEURS_MIN_FONDATION && !(await estMjOuAdmin(guild, interaction.user.id))) {
    await repondre(
      interaction,
      `**${ville.nom}** compte ${nombreHabitants} habitant(s) : il en faut au moins ${JOUEURS_MIN_FONDATION} pour la fonder. ` +
        "Acceptez d'autres demandes d'inscription dans #nouvel-arrivant.",
    );
    return;
  }

  const createurJoueur = ville.habitants.find((h) => h.utilisateurId === ville.createurUtilisateurId);
  if (!createurJoueur) {
    await repondre(interaction, "Erreur interne : le créateur n'est pas listé comme habitant de sa propre ville.");
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const paMax = Math.min(PA_MAX_PLAFOND, Math.floor(PA_CIBLE_VILLE / nombreHabitants));

  const groupes = await prisma.groupe.findMany({ include: { _count: { select: { villes: true } } } });
  const groupeId =
    groupes.find((g) => g._count.villes < GROUPES_VILLES_MAX)?.id ?? (await prisma.groupe.create({ data: {} })).id;

  await prisma.$transaction([
    prisma.ville.update({
      where: { id: ville.id },
      data: {
        statut: StatutVille.ACTIVE,
        dateFondation: new Date(),
        paMaxFondation: paMax,
        groupeId,
        cycleActuel: 1,
        phaseDepuis: new Date(),
        mandatFinCycle: CYCLES_PAR_MANDAT_MAIRE,
        maireId: createurJoueur.id,
      },
    }),
    prisma.joueur.updateMany({ where: { villeId: ville.id }, data: { paMax, paActuel: paMax } }),
    prisma.demandeInscription.updateMany({
      where: { villeId: ville.id, statut: StatutDemande.EN_ATTENTE },
      data: { statut: StatutDemande.REFUSEE, dateReponse: new Date() },
    }),
  ]);

  const { roleVille, salonMairie } = await creerStructureVille(guild, ville.id, ville.nom);
  await ensureTerritoiresGroupe(guild, groupeId);

  const roleCitoyen = await trouverRole(guild, ROLE_CITOYEN.cle);
  // Role Mort d'une partie precedente (ville tombee) retire : le joueur recommence vivant
  const roleMort = await trouverRole(guild, ROLE_MORT.cle);
  // Le joueur a desormais une ville : il n'est plus Nomade
  const roleNomade = await trouverRole(guild, ROLE_NOMADE.cle);
  for (const habitant of ville.habitants) {
    const membre = await guild.members.fetch(habitant.utilisateur.discordId).catch(() => null);
    if (!membre) continue;
    await membre.roles.add(roleVille).catch(() => null);
    if (roleCitoyen) await membre.roles.add(roleCitoyen).catch(() => null);
    if (roleMort) await membre.roles.remove(roleMort).catch(() => null);
    if (roleNomade) await membre.roles.remove(roleNomade).catch(() => null);
  }

  await supprimerMessagesRecrutement(guild, ville.id);

  await salonMairie.send(
    `**${ville.nom}** est fondée ! ${nombreHabitants} habitant(s), PA max individuel : **${paMax}**.\n` +
      `${interaction.user} devient le premier maire (mandat de ${CYCLES_PAR_MANDAT_MAIRE} cycles).\n` +
      "Faim et soif démarrent à 100/100. Les commandes `/action` et `/aide` arrivent bientôt.",
  );

  await interaction.editReply(
    `**${ville.nom}** est fondée avec ${nombreHabitants} habitant(s) (PA max individuel : ${paMax}). Vous êtes le premier maire.`,
  );
}

const ACTIONS = { rejoindre, quitter, annuler, fonder } as const;

export async function gererBoutonVille(interaction: ButtonInteraction, action: string, idBrut: string) {
  const guild = interaction.guild;
  const villeId = Number(idBrut);
  if (!guild || !Number.isInteger(villeId) || !(action in ACTIONS)) return;
  await ACTIONS[action as keyof typeof ACTIONS](interaction, guild, villeId);
}
