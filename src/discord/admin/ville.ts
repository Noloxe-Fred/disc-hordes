import { MeteoType, StatutJoueur, StatutVille, TypeBatiment, TypePhase } from "@prisma/client";
import { ButtonStyle, MessageFlags, type ButtonInteraction, type Guild } from "discord.js";
import { CYCLES_PAR_MANDAT_MAIRE } from "../../config/metiers";
import { PV_MAX } from "../../config/sante";
import { prisma } from "../../db";
import { fonderVille } from "../boutonsVille";
import { declarerChuteVille, nettoyerGroupeSiTombe } from "../chute";
import { changerPositionDiscord, retablirJoueurDiscord, retirerJoueurDeVilleDiscord } from "../joueurDiscord";
import { construirePalier, rafraichirPanneauChantiers } from "../chantiers";
import { CHANTIERS, chantier } from "../../config/batiments";
import { rafraichirPanneauMaisons } from "../maisons";
import { rafraichirMessageVille, supprimerMessagesRecrutement } from "../messageVille";
import { renommerRessource, supprimerRessources } from "../reconcile";
import { LONGUEUR_MAX_NOM_VILLE } from "../texteLibre";
import { posterDansMairie, synchroniserSalonAtelier } from "../villeStructure";
import { PALIERS_ZONE, TYPES_ZONE, typeDeZone } from "../../config/zones";
import { rechargerZones } from "../../services/stocks";
import {
  champChoix,
  champTexte,
  champVille,
  confirmer,
  journaliser,
  lireChoix,
  ouvrirFormulaire,
  repondre,
  type FamilleAdmin,
} from "./outils";

// Famille "Ville" du panneau /admin (conception.md §4) : effacer, renommer, recharger des territoires, forcer la fondation,
// forcer la chute, reset. Effacer, forcer la chute et reset demandent une confirmation.

async function choisirVille(interaction: ButtonInteraction, titre: string, statuts: StatutVille[], aucune: string) {
  const champ = await champVille(statuts);
  if (!champ) {
    await repondre(interaction, aucune);
    return null;
  }
  const soumission = await ouvrirFormulaire(interaction, titre, [champ]);
  if (!soumission) return null;
  const ville = await prisma.ville.findUnique({ where: { id: Number(lireChoix(soumission, "ville")) } });
  if (!ville) {
    await repondre(soumission, "Cette ville n'existe plus.");
    return null;
  }
  return { soumission, ville };
}

// --- Effacer : supprime la ville, ses personnages et ses salons/roles, quel que soit son statut ---

export async function effacerVille(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.findUniqueOrThrow({
    where: { id: villeId },
    include: { habitants: { include: { utilisateur: true } } },
  });

  if (ville.statut === StatutVille.EN_CREATION) await supprimerMessagesRecrutement(guild, villeId);

  // Joueurs encore dans la ville : position, roles de la ville et retour au role Nomade
  for (const habitant of ville.habitants.filter((h) => h.dateSortie === null && ville.statut === StatutVille.ACTIVE)) {
    await changerPositionDiscord(guild, habitant.utilisateur.discordId, habitant.zoneActuelleId, null);
    await retirerJoueurDeVilleDiscord(guild, habitant.utilisateur.discordId, villeId);
  }
  await supprimerRessources(guild, [`role:ville:${villeId}`, `categorie:ville:${villeId}`], [`salon:ville:${villeId}:`]);

  // Ordre impose par les cles etrangeres sans cascade vers Joueur (votes, gardes...)
  const joueurIds = ville.habitants.map((h) => h.id);
  await prisma.$transaction([
    prisma.ville.update({ where: { id: villeId }, data: { maireId: null } }),
    prisma.vote.deleteMany({ where: { OR: [{ votantId: { in: joueurIds } }, { election: { villeId } }] } }),
    prisma.candidature.deleteMany({ where: { OR: [{ joueurId: { in: joueurIds } }, { election: { villeId } }] } }),
    prisma.election.deleteMany({ where: { villeId } }),
    prisma.gardeVolontaire.deleteMany({ where: { OR: [{ joueurId: { in: joueurIds } }, { cycleAttaque: { villeId } }] } }),
    prisma.cycleAttaque.deleteMany({ where: { villeId } }),
    prisma.journalEntree.deleteMany({ where: { OR: [{ villeId }, { joueurId: { in: joueurIds } }] } }),
    prisma.contributionBatiment.deleteMany({ where: { batiment: { villeId } } }),
    prisma.joueur.deleteMany({ where: { villeId } }), // inventaires et cartes supprimes en cascade
    prisma.ville.delete({ where: { id: villeId } }), // demandes, inventaire et batiments supprimes en cascade
  ]);

  // Groupe sans ville en creation ni en jeu : salons, roles, zones et groupe supprimes
  if (ville.groupeId !== null) await nettoyerGroupeSiTombe(guild, ville.groupeId);
}

async function effacer(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirVille(
    interaction,
    "Effacer une ville",
    [StatutVille.EN_CREATION, StatutVille.ACTIVE, StatutVille.TOMBEE],
    "Aucune ville à effacer.",
  );
  if (!cible) return;
  const { soumission, ville } = cible;

  const choix = await confirmer(
    soumission,
    `⚠️ **Effacer ${ville.nom}** : la ville, ses personnages (inventaires, cartes, historique) et ses salons et rôles ` +
      "Discord seront supprimés, sans récapitulatif de chute. Les joueurs encore dedans redeviennent Nomades. Action irréversible.",
    "Effacer la ville",
  );
  if (!choix) return;

  await effacerVille(guild, ville.id);
  await journaliser(interaction.user, "Effacer une ville", `${ville.nom} (#${ville.id}, ${ville.statut})`);
  // Le panneau a pu etre ouvert depuis un salon de la ville, supprime avec elle
  await choix.editReply(`**${ville.nom}** a été effacée.`).catch(() => null);
}

// --- Renommer : base, role-ville, categorie et salon vocal (ou message de recrutement) ---

// --- Recharger des territoires : stocks des zones du groupe d'une ville remis a leur maximum (equilibrage.md §5) ---

const TOUS = "tous";

async function recharger(interaction: ButtonInteraction) {
  const champ = await champVille([StatutVille.ACTIVE]);
  if (!champ) {
    await repondre(interaction, "Aucune ville en jeu.");
    return;
  }
  const soumission = await ouvrirFormulaire(interaction, "Recharger des territoires", [
    champ,
    champChoix("type", "Type de zone", [{ label: "Tous les types", value: TOUS }, ...TYPES_ZONE.map((t) => ({ label: t.nom, value: t.cle }))]),
    champChoix("palier", "Distance", [{ label: "Toutes les distances", value: TOUS }, ...PALIERS_ZONE.map((p) => ({ label: p.nom, value: p.palier }))]),
    champChoix("stock", "Stock à recharger", [
      { label: "Les deux", value: TOUS },
      { label: "Ressources naturelles (bois de forêt, baies, gibiers)", value: "naturel" },
      { label: "Le reste du butin (sans régénération)", value: "fini" },
    ]),
  ]);
  if (!soumission) return;
  const ville = await prisma.ville.findUnique({ where: { id: Number(lireChoix(soumission, "ville")) } });
  if (!ville?.groupeId) {
    await repondre(soumission, "Cette ville n'a pas de territoires.");
    return;
  }
  const type = lireChoix(soumission, "type");
  const palier = lireChoix(soumission, "palier");
  const stock = lireChoix(soumission, "stock");
  const zones = (await prisma.zone.findMany({ where: { groupeId: ville.groupeId } })).filter(
    (z) => (type === TOUS || typeDeZone(z.nom)?.cle === type) && (palier === TOUS || z.palier === palier),
  );
  const n = await rechargerZones(
    zones.map((z) => z.id),
    { naturel: stock !== "fini", fini: stock !== "naturel" },
  );
  const detail = `${n} zone(s) du groupe de ${ville.nom} : ${zones.map((z) => z.nom).join(", ")}`;
  await journaliser(interaction.user, "Recharger des territoires", detail);
  await repondre(soumission, `♻️ Stocks rechargés dans ${detail}.`);
}

async function renommer(interaction: ButtonInteraction, guild: Guild) {
  const champ = await champVille([StatutVille.EN_CREATION, StatutVille.ACTIVE]);
  if (!champ) {
    await repondre(interaction, "Aucune ville en création ou en jeu.");
    return;
  }
  const soumission = await ouvrirFormulaire(interaction, "Renommer une ville", [
    champ,
    champTexte("nom", "Nouveau nom", { max: LONGUEUR_MAX_NOM_VILLE }),
  ]);
  if (!soumission) return;

  const nom = soumission.fields.getTextInputValue("nom").trim();
  const ville = await prisma.ville.findUnique({ where: { id: Number(lireChoix(soumission, "ville")) } });
  if (!ville || ville.statut === StatutVille.TOMBEE) {
    await repondre(soumission, "Cette ville n'est plus en création ni en jeu.");
    return;
  }
  if (!nom) {
    await repondre(soumission, "Le nom de la ville ne peut pas être vide.");
    return;
  }

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  await prisma.ville.update({ where: { id: ville.id }, data: { nom } });
  if (ville.statut === StatutVille.EN_CREATION) {
    await rafraichirMessageVille(guild, ville.id);
  } else {
    // Memes noms qu'a la fondation (villeStructure.ts)
    await renommerRessource(guild, `role:ville:${ville.id}`, `Ville:${nom}`);
    await renommerRessource(guild, `categorie:ville:${ville.id}`, nom);
    await renommerRessource(guild, `salon:ville:${ville.id}:vocal`, `Ville ${nom}`);
  }

  await journaliser(interaction.user, "Renommer une ville", `${ville.nom} → ${nom} (#${ville.id})`);
  await soumission.editReply(`**${ville.nom}** s'appelle désormais **${nom}**.`);
}

// --- Construire un batiment : le batiment choisi gagne un palier, sans ressources ni PA (avancement en cours perdu) ---

async function construireBatiment(interaction: ButtonInteraction, guild: Guild) {
  const champ = await champVille([StatutVille.ACTIVE]);
  if (!champ) {
    await repondre(interaction, "Aucune ville en jeu.");
    return;
  }
  const soumission = await ouvrirFormulaire(interaction, "Construire un bâtiment", [
    champ,
    champChoix(
      "batiment",
      "Bâtiment",
      CHANTIERS.map((c) => ({ label: `${c.emoji} ${c.nom}`, value: c.type, description: `${c.paliers.length} palier(s)` })),
    ),
  ]);
  if (!soumission) return;
  const ville = await prisma.ville.findUnique({ where: { id: Number(lireChoix(soumission, "ville")) } });
  if (ville?.statut !== StatutVille.ACTIVE) {
    await repondre(soumission, "Cette ville n'est plus en jeu.");
    return;
  }
  const c = chantier(lireChoix(soumission, "batiment") as TypeBatiment);

  // Accuse reception tout de suite : ouvrir l'atelier ou la radio (salons, acces des habitants) peut depasser les 3 s
  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const annonce = await construirePalier(guild, ville.id, c.type, "Construit par l'équipe du jeu.");
  if (!annonce) {
    await soumission.editReply(`${c.emoji} **${c.nom}** est déjà au dernier palier à **${ville.nom}**.`);
    return;
  }
  await rafraichirPanneauChantiers(guild, ville.id);
  const palier = (await prisma.batimentVille.findUniqueOrThrow({ where: { villeId_type: { villeId: ville.id, type: c.type } } })).palierActuel;
  await journaliser(interaction.user, "Construire un bâtiment", `${c.nom} palier ${palier}, ${ville.nom} (#${ville.id})`);
  await soumission.editReply(`${annonce}
-# À **${ville.nom}**, les ressources et PA déjà versés sur ce palier sont perdus.`);
}

// --- Forcer la fondation : sans minimum d'habitants ---

async function forcerFondation(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirVille(interaction, "Forcer la fondation", [StatutVille.EN_CREATION], "Aucune ville en création.");
  if (!cible) return;
  const { soumission, ville } = cible;
  if (ville.statut !== StatutVille.EN_CREATION) {
    await repondre(soumission, "Cette ville n'est plus en cours de création.");
    return;
  }

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const { nombreHabitants, paMax } = await fonderVille(guild, ville.id);
  await journaliser(interaction.user, "Forcer la fondation", `${ville.nom} (#${ville.id}), ${nombreHabitants} habitant(s)`);
  await soumission.editReply(
    `**${ville.nom}** est fondée avec ${nombreHabitants} habitant(s) (PA max individuel : ${paMax}). Son créateur en est le premier maire.`,
  );
}

// --- Forcer la chute : recapitulatif dans #commemoration et depart de tous les joueurs ---

async function forcerChute(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirVille(interaction, "Forcer la chute", [StatutVille.ACTIVE], "Aucune ville en jeu.");
  if (!cible) return;
  const { soumission, ville } = cible;

  const choix = await confirmer(
    soumission,
    `⚠️ **Forcer la chute de ${ville.nom}** : fin de partie, récapitulatif posté dans #commémoration et départ de tous ` +
      "ses joueurs (retour au rôle Nomade). Si c'était la dernière ville de son groupe, les salons et rôles du groupe " +
      "sont supprimés. Action irréversible.",
    "Faire tomber la ville",
  );
  if (!choix) return;

  const actuelle = await prisma.ville.findUnique({ where: { id: ville.id } });
  if (actuelle?.statut !== StatutVille.ACTIVE) {
    await choix.editReply(`**${ville.nom}** n'est plus en jeu.`);
    return;
  }
  await posterDansMairie(guild, ville.id, `🏚️ **${ville.nom}** est tombée.`);
  await declarerChuteVille(guild, ville.id);
  await journaliser(interaction.user, "Forcer la chute", `${ville.nom} (#${ville.id}), cycle ${ville.cycleActuel}`);
  // Salons du groupe supprimes si c'etait sa derniere ville : le panneau a pu etre ouvert depuis l'un d'eux
  await choix.editReply(`**${ville.nom}** est tombée.`).catch(() => null);
}

// --- Reset : la ville repart au cycle 1 avec ses habitants actuels, tous vivants et a pleine sante ---

async function resetVille(guild: Guild, villeId: number): Promise<void> {
  const habitants = await prisma.joueur.findMany({ where: { villeId, dateSortie: null }, include: { utilisateur: true } });

  const joueurIds = habitants.map((h) => h.id);
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: villeId } });
  await prisma.$transaction([
    prisma.election.deleteMany({ where: { villeId } }), // candidatures et votes supprimes en cascade
    prisma.cycleAttaque.deleteMany({ where: { villeId } }), // gardes supprimees en cascade
    prisma.journalEntree.deleteMany({ where: { villeId } }),
    prisma.inventaireVille.deleteMany({ where: { villeId } }),
    prisma.batimentVille.deleteMany({ where: { villeId } }), // contributions supprimees en cascade
    prisma.zombieErrant.deleteMany({ where: { villeId } }),
    prisma.demandeAccueil.deleteMany({ where: { OR: [{ villeId }, { joueurId: { in: joueurIds } }] } }),
    // Sacs des habitants, et des corps laisses par ceux qui sont partis (discord/depouilles.ts)
    prisma.inventaireJoueur.deleteMany({ where: { joueur: { villeId } } }),
    prisma.carteDecouverte.deleteMany({ where: { joueurId: { in: joueurIds } } }),
    prisma.contributionMaison.deleteMany({ where: { joueurId: { in: joueurIds } } }),
    // Valeurs de depart d'un personnage (schema Joueur) ; le PA max fige a l'arrivee est conserve
    ...habitants.map((h) =>
      prisma.joueur.update({
        where: { id: h.id },
        data: {
          statut: StatutJoueur.VIVANT,
          paActuel: h.paMax,
          faim: 100,
          soif: 100,
          phasesFaimVide: 0,
          phasesSoifVide: 0,
          pv: PV_MAX,
          infecteDepuis: null,
          maisonPalier: 0,
          maisonPaInstalles: 0,
          bonusPaReveil: 0,
          fouillesSansRencontre: 0,
          infusionJusqua: null,
          executionEnAttente: false,
          rencontrePvZombie: null, rencontreRetourZoneId: null, rencontreRetourVille: false,
          xp: 0,
          dateMort: null,
          causeMort: null,
          zoneMortId: null,
          zoneActuelleId: null,
        },
      }),
    ),
    prisma.ville.update({
      where: { id: villeId },
      data: {
        cycleActuel: 1,
        phaseActuelle: TypePhase.JOUR,
        phaseDepuis: new Date(),
        meteoActuelle: MeteoType.NORMALE,
        rationnementActif: false,
        rationNourriture: null,
        rationEau: null,
        rationNote: null,
        chantierPrioritaire: null,
        structuresDefense: 0,
        mandatFinCycle: ville.maireId !== null ? CYCLES_PAR_MANDAT_MAIRE : null,
      },
    }),
  ]);

  // Apres la remise a zero : les acces se recalculent sur la position (en ville) et l'inventaire (vide) remis a jour
  for (const habitant of habitants) {
    await changerPositionDiscord(guild, habitant.utilisateur.discordId, habitant.zoneActuelleId, null);
    await retablirJoueurDiscord(guild, habitant.id);
  }
}

async function reset(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirVille(interaction, "Reset d'une ville", [StatutVille.ACTIVE], "Aucune ville en jeu.");
  if (!cible) return;
  const { soumission, ville } = cible;

  const choix = await confirmer(
    soumission,
    `⚠️ **Reset de ${ville.nom}** : la ville repart au cycle 1 (jour) avec ses habitants actuels, tous vivants, à pleine ` +
      "santé, faim et soif à 100, PA au maximum, sans maison, ramenés en ville. Inventaires, cartes, bâtiments, banque, élections et " +
      "historique des attaques sont effacés ; le maire est conservé. Action irréversible.",
    "Réinitialiser la ville",
  );
  if (!choix) return;

  const actuelle = await prisma.ville.findUnique({ where: { id: ville.id } });
  if (actuelle?.statut !== StatutVille.ACTIVE) {
    await choix.editReply(`**${ville.nom}** n'est plus en jeu.`);
    return;
  }
  await resetVille(guild, ville.id);
  await posterDansMairie(guild, ville.id, `🔄 **${ville.nom}** repart de zéro : cycle 1, le jour se lève.`);
  await rafraichirPanneauChantiers(guild, ville.id);
  await rafraichirPanneauMaisons(guild, ville.id);
  await synchroniserSalonAtelier(guild, ville.id);
  await journaliser(interaction.user, "Reset d'une ville", `${ville.nom} (#${ville.id}), était au cycle ${ville.cycleActuel}`);
  await choix.editReply(`**${ville.nom}** a été réinitialisée (cycle 1).`);
}

export const FAMILLE_VILLE: FamilleAdmin = {
  cle: "ville",
  titre: "Ville",
  emoji: "🏘️",
  resume: "effacer, renommer, recharger des territoires, construire un bâtiment, forcer la fondation ou la chute, reset",
  actions: [
    {
      cle: "effacer",
      libelle: "Effacer",
      description: "supprime une ville (quel que soit son statut), ses personnages et ses salons et rôles, sans récapitulatif.",
      style: ButtonStyle.Danger,
      executer: effacer,
    },
    {
      cle: "renommer",
      libelle: "Renommer",
      description: "change le nom d'une ville en création ou en jeu, ainsi que son rôle et ses salons.",
      executer: renommer,
    },
    {
      cle: "recharger",
      libelle: "Recharger des territoires",
      description: "remet au maximum les stocks de butin des zones du groupe d'une ville (par type, distance et stock).",
      style: ButtonStyle.Success,
      executer: recharger,
    },
    {
      cle: "construire",
      libelle: "Construire un bâtiment",
      description: "fait progresser d'un palier un bâtiment d'une ville en jeu, sans ressources ni PA (l'avancement en cours est perdu).",
      style: ButtonStyle.Success,
      executer: construireBatiment,
    },
    {
      cle: "fonder",
      libelle: "Forcer la fondation",
      description: "fonde une ville en création sans minimum d'habitants ; son créateur devient maire.",
      style: ButtonStyle.Success,
      executer: forcerFondation,
    },
    {
      cle: "chute",
      libelle: "Forcer la chute",
      description: "fait tomber une ville en jeu (récapitulatif dans #commémoration, départ des joueurs).",
      style: ButtonStyle.Danger,
      executer: forcerChute,
    },
    {
      cle: "reset",
      libelle: "Reset",
      description: "relance une ville en jeu au cycle 1 avec ses habitants actuels, tous vivants et à pleine santé.",
      style: ButtonStyle.Danger,
      executer: reset,
    },
  ],
};
