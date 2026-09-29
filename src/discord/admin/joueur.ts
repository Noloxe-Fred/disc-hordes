import { CauseMort, Metier, StatutJoueur, StatutVille } from "@prisma/client";
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
import { LIBELLE_CAUSE_MORT } from "../../config/mort";
import { JAUGE_MAX, PV_MAX } from "../../config/sante";
import { prisma } from "../../db";
import { DUREE_INCUBATION_HEURES } from "../../game/infection";
import { calculerPaMax } from "../../game/pa";
import { infligerDegats } from "../../game/sante";
import { deplacerJoueur } from "../deplacement";
import { verifierZombiesErrants } from "../zombieErrant";
import { appliquerExclusionDiscord, retablirJoueurDiscord } from "../joueurDiscord";
import { rafraichirMessageVille } from "../messageVille";
import {
  DELAI_SELECTION_MS,
  champChoix,
  champMembre,
  champTexte,
  journaliser,
  lireAjustement,
  lireChoix,
  lireEntier,
  lireJoueur,
  ouvrirFormulaire,
  repondre,
  type FamilleAdmin,
  type JoueurCible,
} from "./outils";

// Famille "Joueur" du panneau /admin (conception.md §4) : teleporter, ressusciter, blesser, guerir, infecter,
// exclure et reintegrer de force, changer de metier, ajuster faim, soif et PA. Le joueur est choisi parmi les membres du serveur ;
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
  await prisma.$transaction([
    prisma.joueur.update({
      where: { id: joueur.id },
      data: { statut: StatutJoueur.VIVANT, pv: PV_MAX, infecteDepuis: null, dateMort: null, causeMort: null },
    }),
    // Un joueur transforme ramene a la vie n'erre plus en zombie
    prisma.zombieErrant.deleteMany({ where: { transformeId: joueur.id } }),
  ]);
  await retablirJoueurDiscord(guild, joueur.id);
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

// --- Transformer en zombie : l'incubation arrive a terme tout de suite (tests, animation) ---

async function transformer(interaction: ButtonInteraction, guild: Guild) {
  const cible = await choisirJoueur(interaction, "Transformer en zombie", [StatutJoueur.VIVANT, StatutJoueur.EXCLU], "n'est pas vivant.");
  if (!cible) return;
  const { soumission, joueur } = cible;

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const debutIncubation = new Date(Date.now() - DUREE_INCUBATION_HEURES * 3_600_000);
  await prisma.joueur.update({ where: { id: joueur.id }, data: { infecteDepuis: debutIncubation } });
  await verifierZombiesErrants(guild);
  await journaliser(interaction.user, "Transformer en zombie", detailJournal(joueur));
  await soumission.editReply({ content: `${mention(joueur)} s'est transformé en zombie.`, allowedMentions: { parse: [] } });
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
  await appliquerExclusionDiscord(guild, joueur.id);
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
  await retablirJoueurDiscord(guild, joueur.id);
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

// --- Blesser : retire des PV (la mort est possible, avec la cause choisie) ---

const CAUSES_BLESSURE: { cause: CauseMort; libelle: string }[] = [
  { cause: CauseMort.COMBAT_EXTERIEUR, libelle: "Combat en territoire externe" },
  { cause: CauseMort.ATTAQUE_NOCTURNE, libelle: "Attaque nocturne" },
  { cause: CauseMort.FAIM, libelle: "Faim" },
  { cause: CauseMort.SOIF, libelle: "Soif" },
  { cause: CauseMort.EAU_CONTAMINEE, libelle: "Eau croupie" },
];

async function blesser(interaction: ButtonInteraction, guild: Guild) {
  const soumission = await ouvrirFormulaire(interaction, "Blesser un joueur", [
    champMembre(),
    champTexte("pv", `PV à retirer (1-${PV_MAX})`, { max: 2, exemple: "2" }),
    champChoix(
      "cause",
      "Cause si le joueur meurt",
      CAUSES_BLESSURE.map(({ cause, libelle }) => ({ label: libelle, value: cause })),
    ),
  ]);
  if (!soumission) return;
  const joueur = await lireJoueur(soumission);
  if (!joueur) {
    await repondre(soumission, SANS_PERSONNAGE);
    return;
  }
  if (joueur.statut !== StatutJoueur.VIVANT && joueur.statut !== StatutJoueur.EXCLU) {
    await repondre(soumission, `${mention(joueur)} n'est pas vivant.`);
    return;
  }
  const pv = lireEntier(soumission.fields.getTextInputValue("pv"), 1, PV_MAX);
  if (pv === null) {
    await repondre(soumission, `Indiquez un nombre de PV entre 1 et ${PV_MAX}.`);
    return;
  }
  const cause = (lireChoix(soumission, "cause") as CauseMort | null) ?? CauseMort.COMBAT_EXTERIEUR;

  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const resultat = await infligerDegats(guild, joueur.id, pv, cause);
  await journaliser(interaction.user, "Blesser un joueur", `${detailJournal(joueur)} : −${pv} PV${resultat.mort ? " (mort)" : ""}`);
  await soumission.editReply({
    content: resultat.mort
      ? `${mention(joueur)} perd ${pv} PV et meurt (${LIBELLE_CAUSE_MORT[cause]})` + (resultat.villeTombee ? " : sa ville est tombée." : ".")
      : `${mention(joueur)} perd ${pv} PV : ${joueur.pv} → **${resultat.pvRestants}** / ${PV_MAX}.`,
    allowedMentions: { parse: [] },
  });
}

// --- Ajuster faim, soif et PA : valeur fixe ("80") ou relative ("+20", "-10"), vide = inchange ---

async function ajusterJauges(interaction: ButtonInteraction) {
  const aide = "Ex. 80, +20 ou -10 ; vide = inchangé";
  const soumission = await ouvrirFormulaire(interaction, "Ajuster faim, soif et PA", [
    champMembre(),
    champTexte("faim", "Faim (0-100)", { requis: false, max: 5, description: aide }),
    champTexte("soif", "Soif (0-100)", { requis: false, max: 5, description: aide }),
    champTexte("pa", "PA (0 au PA max effectif)", { requis: false, max: 5, description: aide }),
  ]);
  if (!soumission) return;

  const joueur = await lireJoueur(soumission);
  if (!joueur) {
    await repondre(soumission, "Ce membre n'a pas de personnage dans une ville en jeu.");
    return;
  }
  if (joueur.statut === StatutJoueur.MORT || joueur.statut === StatutJoueur.ZOMBIFIE) {
    await repondre(soumission, `<@${joueur.utilisateur.discordId}> est mort.`);
    return;
  }

  const { paMax } = calculerPaMax(joueur);
  const paActuel = joueur.paActuel ?? 0;
  const faim = lireAjustement(soumission.fields.getTextInputValue("faim"), joueur.faim, 0, JAUGE_MAX);
  const soif = lireAjustement(soumission.fields.getTextInputValue("soif"), joueur.soif, 0, JAUGE_MAX);
  const pa = lireAjustement(soumission.fields.getTextInputValue("pa"), paActuel, 0, paMax);
  if (faim === null || soif === null || pa === null) {
    await repondre(soumission, "Saisie invalide : indiquez un nombre (80), ou un ajustement (+20, -10).");
    return;
  }
  if (faim === undefined && soif === undefined && pa === undefined) {
    await repondre(soumission, "Aucune valeur saisie : rien n'a changé.");
    return;
  }

  await prisma.joueur.update({
    where: { id: joueur.id },
    data: {
      faim,
      soif,
      paActuel: pa,
      // Une jauge remontee au-dessus de 0 remet a zero son compteur de phases a vide (malus de PA)
      ...(faim !== undefined && faim > 0 ? { phasesFaimVide: 0 } : {}),
      ...(soif !== undefined && soif > 0 ? { phasesSoifVide: 0 } : {}),
    },
  });

  const changements = [
    faim !== undefined ? `faim ${joueur.faim} → ${faim}` : null,
    soif !== undefined ? `soif ${joueur.soif} → ${soif}` : null,
    pa !== undefined ? `PA ${paActuel} → ${pa} (max ${paMax})` : null,
  ]
    .filter((ligne) => ligne !== null)
    .join(", ");
  await journaliser(
    interaction.user,
    "Ajuster faim/soif/PA",
    `${joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId} (${joueur.ville?.nom}) : ${changements}`,
  );
  await repondre(soumission, `<@${joueur.utilisateur.discordId}> : ${changements}.`);
}

export const FAMILLE_JOUEUR: FamilleAdmin = {
  cle: "joueur",
  titre: "Joueur",
  emoji: "🧍",
  resume: "position, vie, santé, faim, soif, PA, exclusion et métier d'un personnage",
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
    { cle: "blesser", libelle: "Blesser", description: "retire des PV à un joueur ; à 0 PV il meurt, avec la cause choisie.", style: ButtonStyle.Danger, executer: blesser },
    { cle: "guerir", libelle: "Guérir", description: "rend tous ses PV à un joueur et soigne son infection.", style: ButtonStyle.Success, executer: guerir },
    {
      cle: "transformer",
      libelle: "Transformer en zombie",
      description: "fait arriver l'incubation à terme : le joueur meurt et son zombie attaque un survivant présent.",
      style: ButtonStyle.Danger,
      executer: transformer,
    },
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
    {
      cle: "jauges",
      libelle: "Ajuster faim/soif/PA",
      description: "fixe (80) ou ajuste (+20, -10) la faim, la soif et les PA d'un joueur ; les PA sont plafonnés au PA max effectif.",
      executer: ajusterJauges,
    },
  ],
};
