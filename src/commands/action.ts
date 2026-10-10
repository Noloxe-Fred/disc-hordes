import { Metier, StatutJoueur, StatutVille, TypeElection, TypePhase, type PalierZone } from "@prisma/client";
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
  type MessageComponentInteraction,
  type Guild,
} from "discord.js";
import type { Command } from "../client";
import { COUT_GARDE } from "../config/defense";
import { SURCOUT_ZONE_VIERGE } from "../config/deplacement";
import { DUREE_CANDIDATURES_HEURES, DUREE_DEFIANCE_HEURES, DUREE_VOTE_HEURES } from "../config/politique";
import { LOOT_PAR_ZONE } from "../config/loot";
import { LIBELLE_CAUSE_MORT } from "../config/mort";
import { emojiObjet, OBJET_RADIO, poidsObjet } from "../config/objets";
import { BONUS_CAPTURE_APPAT, OBJET_APPAT, PIEGES } from "../config/pieges";
import { chanceCapture as chanceCapturePiege } from "../services/pieges";
import { typeDeZone } from "../config/zones";
import { prisma } from "../db";
import { ecranCarte, ecranPartage, empechementPartage, partagerCarte } from "../discord/carte";
import { deplacerJoueur } from "../discord/deplacement";
import { synchroniserAccesJoueur } from "../discord/joueurDiscord";
import { estMjActif, MESSAGE_MJ_ACTIF_NE_JOUE_PAS } from "../discord/permissions";
import { trouverSalonTexte } from "../discord/reconcile";
import { estMaireEnExercice, formulaireAnnonce } from "../discord/annonce";
import { attaquer, declencherRencontre, ecranCombat, fuir, tirer } from "../discord/combat";
import { declencherDefiance, empechementDefiance } from "../discord/defiance";
import { declencherElectionJoueur, electionEnCours } from "../discord/election";
import { demandeEnAttente, formulaireAccueil, villesAccueillantes } from "../discord/accueil";
import { formulairePriorite, formulaireRationnement, formulaireSanction } from "../discord/maire";
import { allumerFeu, coutFeu, faireSieste } from "../discord/feu";
import { appaterPiege, coutPosePiege, piegeAutorise, piegesEnSac, poserPiege, releverPiege } from "../discord/pieges";
import { bonusGarde, estDeGarde, monterLaGarde } from "../discord/garde";
import { formulaireSoin } from "../discord/soin";
import { corpsAuMemeEndroit, formulaireFouilleCorps } from "../discord/depouilles";
import { zombieErrantALArrivee } from "../discord/zombieErrant";
import { sortirDeVille } from "../discord/sortie";
import { posterDansMairie } from "../discord/villeStructure";
import { coutDeplacement, coutFouille, coutObservation } from "../game/deplacement";
import { tirerLoot } from "../game/loot";
import { indicesStocks, puiserDansLesStocks, stocksActuels } from "../game/stocks";
import { feuActif } from "../game/feu";
import { calculerPaMax } from "../game/pa";
import { ajouterACarte, zonesDecouvertes } from "../services/carte";
import { chargeSac, deborde, libelleCharge, MESSAGE_SAC_PLEIN, sacPlein } from "../services/charge";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { destinationsDepuis } from "../services/zones";
import { verrouille } from "../services/verrou";

// Menu des actions du joueur (conception.md §4). Vivant (ou exclu) : un bouton par type d'action, chacun
// ouvrant son ecran (« Se deplacer », « Observer », « Fouiller » avec confirmation avant de depenser des PA ;
// « Fouiller un corps » quand un corps est sur place (discord/depouilles.ts), « Carte », « Partager la carte », « Soigner », la nuit en ville « Monter la garde », dehors « Allumer un feu » puis
// « Sieste », dehors « Piège » (poser un piège simple ou avancé, ou relever sa prise, discord/pieges.ts), « Maire » pour le maire (discord/maire.ts), « Élection » tant qu'aucune n'est en cours, dehors
// « Demander l'accueil » (discord/accueil.ts),
// « Quitter la ville »). Face a un zombie
// (discord/combat.ts), seuls « Attaquer » et « Fuir » sont proposes. Mort : quitter sa ville pour en
// rejoindre une autre.
// Anti-spam (equilibrage.md §4) : delai minimal entre deux /action d'un meme utilisateur, et un seul menu
// ouvert a la fois — ouvrir un nouveau menu ferme le precedent, pour qu'aucun clic ne passe par deux menus.

const DELAI_CHOIX_MS = 120_000;
const DELAI_ENTRE_ACTIONS_MS = 3_000;
const derniereOuverture = new Map<string, number>();
const menuOuvert = new Map<string, ChatInputCommandInteraction>();
const COULEUR_VIVANT = 0x2ecc71;
const COULEUR_MORT = 0xc0392b;
const VALEUR_VILLE = "ville";
const OBJET_TORCHE = "Torche";
const MESSAGE_MENU_FERME = "Menu fermé : vous avez rouvert `/action`.";
const MESSAGE_ZOMBIE = "🧟 Un zombie vous barre la route : combattez-le ou fuyez d'abord (`/action`).";

function encadre(texte: string, couleur = COULEUR_VIVANT): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(couleur).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte));
}

interface Destination {
  id: number | null; // null = la ville
  nom: string;
  palier: PalierZone | null;
  vierge: boolean; // zone encore absente de la carte du joueur (surcout, equilibrage.md §4)
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
    include: { ville: true, zoneActuelle: { include: { piege: true } } },
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
  const feuIci = feuActif(joueur.zoneActuelle, ville);
  // Piege : celui de la zone, sinon les pieges du sac a poser dans une zone qui s'y prete
  const piegeIci = joueur.zoneActuelle?.piege ?? null;
  const piegesAPoser =
    joueur.zoneActuelle !== null && piegeIci === null && piegeAutorise(joueur.zoneActuelle.nom) ? await piegesEnSac(joueurId) : [];
  const deGarde = await estDeGarde(joueurId, ville.id, ville.cycleActuel);
  // Garde volontaire : la nuit, en ville, pour les vivants qui ne la montent pas deja
  const gardePossible =
    ville.phaseActuelle === TypePhase.NUIT && joueur.zoneActuelleId === null && joueur.statut === StatutJoueur.VIVANT && !deGarde;
  const entete =
    `## Actions — ${ville.nom}\n` +
    `📍 ${joueur.zoneActuelle ? joueur.zoneActuelle.nom : "En ville"}` +
    ` · ⚡ ${paActuel} / ${calculerPaMax(joueur).paMax} PA` +
    (ville.phaseActuelle === TypePhase.NUIT ? " · 🌙 nuit : actions plus coûteuses" : " · ☀️ jour") +
    (feuIci ? "\n🔥 Un feu brûle ici : zombies deux fois moins nombreux, sieste possible." : "") +
    (piegeIci ? `\n🪤 Un piège est posé ici${piegeIci.priseLe ? " : une prise attend d'être relevée !" : ", vide pour l'instant."}` : "") +
    (deGarde && ville.phaseActuelle === TypePhase.NUIT ? "\n🛡️ Vous montez la garde cette nuit : restez en ville jusqu'à l'aube." : "") +
    (exclu ? "\nVous êtes **exclu** de votre ville : vous ne pouvez pas y rentrer." : "");
  // Election du maire : un citoyen vivant la declenche quand aucune n'est en cours (discord/election.ts)
  const electionPossible = joueur.statut === StatutJoueur.VIVANT && (await electionEnCours(ville.id)) === null;
  // Vote de defiance : un citoyen vivant autre que le maire, quand aucun n'est en cours (discord/defiance.ts)
  const defiancePossible = (await empechementDefiance(joueurId)) === null;
  // Dehors, un survivant peut demander a rejoindre une autre ville du groupe (un exclu, a revenir dans la sienne)
  const accueilPossible = (await villesAccueillantes(joueur)).length > 0;
  const maire = estMaireEnExercice(joueur);
  // Corps dont le sac n'est pas vide, au meme endroit
  const corpsIci = (await corpsAuMemeEndroit(joueur)).length > 0;

  // Allumer un feu : confirmation avant de depenser des PA
  const coutDuFeu = coutFeu(ville.phaseActuelle);
  const ecranFeu = encadre(
    `${entete}\n\n**Allumer un feu** pour **${coutDuFeu} PA** et 1 🔥 Feu de votre sac ? Jusqu'au changement de phase, ` +
      "la zone est plus sûre et chacun peut y faire la sieste.",
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirmer-feu").setLabel(`Allumer (${coutDuFeu} PA)`).setEmoji("🔥").setStyle(ButtonStyle.Primary),
      boutonRetour(),
    ),
  );

  // Piege : relever la prise du piege de la zone, ou poser celui du sac (confirmation avant de depenser des PA)
  const coutDuPiege = coutPosePiege(ville.phaseActuelle);
  const chanceCapture = joueur.zoneActuelle ? Math.round(chanceCapturePiege(joueur.zoneActuelle.palier, piegeIci?.appate ?? false) * 100) : 0;
  const priseIci = piegeIci ? PIEGES[piegeIci.type].prise : null;
  // Appat : un petit gibier du sac dans un piege vide qui n'en a pas encore
  const appatPossible =
    piegeIci !== null &&
    !piegeIci.priseLe &&
    !piegeIci.appate &&
    (await prisma.inventaireJoueur.findFirst({ where: { joueurId, objet: { nom: OBJET_APPAT }, quantite: { gt: 0 } } })) !== null;
  const ecranPiege = encadre(
    piegeIci
      ? `${entete}\n\n` +
          (piegeIci.priseLe
            ? `Un ${emojiObjet(priseIci!)} **${priseIci}** est pris dans le ${PIEGES[piegeIci.type].objet.toLowerCase()}. Le relever ? ` +
              "N'importe quel survivant de passage peut le faire."
            : `Le ${PIEGES[piegeIci.type].objet.toLowerCase()} est vide${piegeIci.appate ? " et appâté" : ""}. ` +
              `${piegeIci.appate ? "À la prochaine aube" : "À chaque aube"}, il a **${chanceCapture} %** de chances ` +
              `d'attraper un ${emojiObjet(priseIci!)} ${priseIci}.` +
              (appatPossible
                ? `
${emojiObjet(OBJET_APPAT)} Un **${OBJET_APPAT}** de votre sac peut servir d'appât : ` +
                  `+${Math.round(BONUS_CAPTURE_APPAT * 100)} points à la prochaine aube.`
                : ""))
      : `${entete}\n\n**Poser un piège** pour **${coutDuPiege} PA** ? Il restera en place et, à chaque aube, aura ` +
          `**${chanceCapture} %** de chances d'attraper sa proie ici (plus la zone est loin, plus il attrape). ` +
          "N'importe qui de passage pourra relever la prise.\n" +
          piegesAPoser.map((type) => `${emojiObjet(PIEGES[type].objet)} **${PIEGES[type].objet}** : ${emojiObjet(PIEGES[type].prise)} ${PIEGES[type].prise}`).join("\n"),
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...(piegeIci?.priseLe
        ? [new ButtonBuilder().setCustomId("relever-piege").setLabel("Relever").setEmoji("🪤").setStyle(ButtonStyle.Primary)]
        : []),
      ...(appatPossible
        ? [new ButtonBuilder().setCustomId("appater-piege").setLabel("Appâter").setEmoji(emojiObjet(OBJET_APPAT)).setStyle(ButtonStyle.Primary)]
        : []),
      ...piegesAPoser.map((type) =>
        new ButtonBuilder()
          .setCustomId(`poser-piege:${type}`)
          .setLabel(`Poser : ${PIEGES[type].objet.toLowerCase()} (${coutDuPiege} PA)`)
          .setEmoji(emojiObjet(PIEGES[type].objet))
          .setStyle(ButtonStyle.Primary),
      ),
      boutonRetour(),
    ),
  );

  // Monter la garde : confirmation avant de depenser des PA
  const ecranGarde = encadre(
    `${entete}\n\n**Monter la garde** cette nuit pour **${COUT_GARDE} PA** ? À l'aube, vous ajoutez **+${bonusGarde(joueur.metier)}** ` +
      "à la défense de la ville, si vous êtes toujours en ville.",
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirmer-garde").setLabel(`Monter la garde (${COUT_GARDE} PA)`).setEmoji("🛡️").setStyle(ButtonStyle.Primary),
      boutonRetour(),
    ),
  );

  // Declencher une election : confirmation
  const ecranElection = encadre(
    `${entete}\n\n**Déclencher une élection du maire ?** Pendant ${DUREE_CANDIDATURES_HEURES} h, tout citoyen vivant peut se porter ` +
      `candidat depuis le panneau posté dans la mairie ; puis ${DUREE_VOTE_HEURES} h de vote, réservé aux citoyens présents en ville. ` +
      "Le maire actuel reste en place jusqu'au résultat et peut se représenter.",
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirmer-election").setLabel("Déclencher l'élection").setEmoji("🗳️").setStyle(ButtonStyle.Primary),
      boutonRetour(),
    ),
  );

  // Declencher un vote de defiance contre le maire : confirmation
  const ecranDefiance = encadre(
    `${entete}\n\n**Déclencher un vote de défiance contre le maire ?** Pendant ${DUREE_DEFIANCE_HEURES} h, les citoyens vivants ` +
      "présents en ville votent « Destituer » ou « Maintenir » depuis le panneau posté dans la mairie. S'il y a plus de " +
      "« Destituer », le maire perd sa fonction et une élection s'ouvre ; il peut s'y représenter.",
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirmer-defiance").setLabel("Déclencher la défiance").setEmoji("⚖️").setStyle(ButtonStyle.Danger),
      boutonRetour(),
    ),
  );

  const menu = encadre(`${entete}\nQue voulez-vous faire ?`).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("deplacer").setLabel("Se déplacer").setEmoji("🧭").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("observer").setLabel("Observer").setEmoji("👁️").setStyle(ButtonStyle.Secondary),
      // Fouille reservee au territoire externe
      ...(joueur.zoneActuelle
        ? [new ButtonBuilder().setCustomId("fouiller").setLabel("Fouiller").setEmoji("🔍").setStyle(ButtonStyle.Secondary)]
        : []),
      ...(corpsIci
        ? [new ButtonBuilder().setCustomId("fouiller-corps").setLabel("Fouiller un corps").setEmoji("💀").setStyle(ButtonStyle.Secondary)]
        : []),
      new ButtonBuilder().setCustomId("carte").setLabel("Carte").setEmoji("🗺️").setStyle(ButtonStyle.Secondary),
      // Partage reserve aux citoyens vivants en ville
      ...(empechementPartage(joueur) === null
        ? [new ButtonBuilder().setCustomId("partager").setLabel("Partager la carte").setEmoji("🤝").setStyle(ButtonStyle.Secondary)]
        : []),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("soigner").setLabel("Soigner").setEmoji("🩹").setStyle(ButtonStyle.Secondary),
      ...(gardePossible
        ? [new ButtonBuilder().setCustomId("garde").setLabel("Monter la garde").setEmoji("🛡️").setStyle(ButtonStyle.Primary)]
        : []),
      // Dehors : allumer un feu, puis faire la sieste tant qu'il brule
      ...(joueur.zoneActuelle
        ? [
            feuIci
              ? new ButtonBuilder().setCustomId("sieste").setLabel("Sieste").setEmoji("😴").setStyle(ButtonStyle.Secondary)
              : new ButtonBuilder().setCustomId("feu").setLabel("Allumer un feu").setEmoji("🔥").setStyle(ButtonStyle.Secondary),
          ]
        : []),
      ...(piegeIci || piegesAPoser.length > 0
        ? [new ButtonBuilder().setCustomId("piege").setLabel("Piège").setEmoji("🪤").setStyle(ButtonStyle.Secondary)]
        : []),
      new ButtonBuilder().setCustomId("quitter-ville").setLabel("Quitter la ville").setEmoji("🚪").setStyle(ButtonStyle.Danger),
    ),
  );
  // Vie politique : panneau du maire, election, defiance, demande d'accueil dans une ville
  const boutonsPolitique = [
    ...(maire ? [new ButtonBuilder().setCustomId("maire").setLabel("Maire").setEmoji("🏛️").setStyle(ButtonStyle.Primary)] : []),
    ...(electionPossible
      ? [new ButtonBuilder().setCustomId("election").setLabel("Élection").setEmoji("🗳️").setStyle(ButtonStyle.Secondary)]
      : []),
    ...(defiancePossible
      ? [new ButtonBuilder().setCustomId("defiance").setLabel("Défiance").setEmoji("⚖️").setStyle(ButtonStyle.Secondary)]
      : []),
    ...(accueilPossible
      ? [new ButtonBuilder().setCustomId("accueil").setLabel("Demander l'accueil").setEmoji("🏘️").setStyle(ButtonStyle.Secondary)]
      : []),
  ];
  if (boutonsPolitique.length > 0) menu.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(boutonsPolitique));

  // Panneau du maire : annonce, votes de sanction, decisions informatives
  const ecranMaire = encadre(
    `${entete}\n\n## 🏛️ Maire\n` +
      "📢 **Annonce** : publier dans la mairie.\n" +
      "🔨 **Bannir** / 🪢 **Exécuter** : la ville vote jusqu'au changement de phase.\n" +
      "🍽️ **Rationner** / ⭐ **Prioriser un chantier** : consignes annoncées dans la mairie et rappelées sur le panneau des chantiers.",
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("annonce").setLabel("Annonce").setEmoji("📢").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bannir").setLabel("Bannir").setEmoji("🔨").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("executer").setLabel("Exécuter").setEmoji("🪢").setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("rationner").setLabel("Rationner").setEmoji("🍽️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("prioriser").setLabel("Prioriser un chantier").setEmoji("⭐").setStyle(ButtonStyle.Secondary),
      boutonRetour(),
    ),
  );

  // Quitter la ville : depart definitif, apres confirmation
  const ecranQuitter = encadre(
    `${entete}

⚠️ **Quitter ${ville.nom} pour toujours ?** Vous abandonnez ce personnage et son sac, perdez l'accès aux salons ` +
      "de la ville et redevenez **Nomade**, sans retour possible dans cette ville." +
      (joueur.statut === StatutJoueur.VIVANT ? " Si vous êtes le dernier habitant vivant, la ville tombe." : ""),
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirmer-quitter").setLabel("Quitter définitivement").setStyle(ButtonStyle.Danger),
      boutonRetour(),
    ),
  );

  const [accessibles, connues] = await Promise.all([
    destinationsDepuis(groupeId, joueur.zoneActuelleId),
    zonesDecouvertes(joueurId).then((ids) => new Set(ids)),
  ]);
  const destinations: Destination[] = [
    ...(accessibles.ville && !exclu ? [{ id: null, nom: `Rentrer en ville (${ville.nom})`, palier: null, vierge: false }] : []),
    ...accessibles.zones.map((z) => ({ id: z.id, nom: z.nom, palier: z.palier, vierge: !connues.has(z.id) })),
  ].map((d) => ({ ...d, cout: coutDeplacement(d.palier, ville.phaseActuelle, d.vierge, joueur.metier) }));
  const torches =
    ville.phaseActuelle === TypePhase.NUIT
      ? ((await prisma.inventaireJoueur.findFirst({ where: { joueurId, objet: { nom: OBJET_TORCHE } } }))?.quantite ?? 0)
      : 0;
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
            description:
              `${d.cout} PA${d.vierge && joueur.metier !== Metier.ECLAIREUR ? " (zone inconnue)" : ""}` +
              (d.cout > paActuel ? " — PA insuffisants" : ""),
          })),
        ),
    ),
  ).addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour()));

  // Observer : voir les zones adjacentes sans s'y rendre, et les ajouter a sa carte
  const coutObs = coutObservation(ville.phaseActuelle, joueur.metier);
  const ecranObservation =
    coutObs > paActuel
      ? encadre(`${entete}\n\nIl vous faut **${coutObs} PA** pour observer les environs (vous en avez ${paActuel}).`).addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour()),
        )
      : encadre(
          `${entete}\n**Observer** les zones voisines sans vous y rendre, pour **${coutObs} PA** ? Elles seront ajoutées à votre carte.`,
        ).addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("confirmer-observation").setLabel(`Observer (${coutObs} PA)`).setStyle(ButtonStyle.Primary),
            boutonRetour(),
          ),
        );

  // Fouiller la zone courante : objets tires selon le type et le palier de la zone, ajoutes au sac tant qu'il y a
  // de la place ; sac plein, la fouille est refusee sans couter de PA
  const coutFou = coutFouille(ville.phaseActuelle);
  const sac = await chargeSac(joueurId);
  const ecranFouille = sacPlein(sac)
    ? encadre(`${entete}\n\n${MESSAGE_SAC_PLEIN} (${libelleCharge(sac)}).`).addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour()),
      )
    : coutFou > paActuel
      ? encadre(`${entete}\n\nIl vous faut **${coutFou} PA** pour fouiller la zone (vous en avez ${paActuel}).`).addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour()),
        )
      : encadre(
          `${entete}\n**Fouiller** la zone pour **${coutFou} PA** ? Ce que vous trouvez va dans votre sac (🎒 ${libelleCharge(sac)}) ; ce qui ne rentre pas reste sur place.`,
        ).addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("confirmer-fouille").setLabel(`Fouiller (${coutFou} PA)`).setStyle(ButtonStyle.Primary),
            boutonRetour(),
          ),
        );

  // Face a un zombie, seul le combat est propose
  const enCombat = joueur.rencontrePvZombie !== null;
  const reponse = await interaction.reply({
    components: [enCombat ? await ecranCombat(joueurId) : menu],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });

  let destination: Destination | undefined;
  for (;;) {
    const clic = await reponse.awaitMessageComponent({ time: DELAI_CHOIX_MS }).catch(() => null);
    if (!clic) return;
    if (await menuRemplace(interaction, clic)) return;

    if (clic.customId === "retour") {
      await clic.update({ components: [menu], attachments: [] }); // retire l'image de la carte le cas echeant
    } else if (clic.customId === "carte") {
      const { conteneur, fichiers } = await ecranCarte(joueurId, boutonRetour());
      await clic.update({ components: [conteneur], files: fichiers });
    } else if (clic.customId === "partager") {
      await clic.update({ components: [await ecranPartage(joueurId, boutonRetour())] });
    } else if (clic.customId === "destinataires" || clic.customId === "toute-la-ville") {
      const destinataireIds = clic.isStringSelectMenu() ? clic.values.map(Number) : null;
      await clic.deferUpdate();
      await clic.editReply({ components: [encadre(await partagerCarte(guild, joueurId, destinataireIds))] });
      return;
    } else if (clic.customId === "deplacer") {
      await clic.update({ components: [ecranDeplacement] });
    } else if (clic.customId === "observer") {
      await clic.update({ components: [ecranObservation] });
    } else if (clic.customId === "confirmer-observation") {
      await clic.deferUpdate();
      await clic.editReply({ components: [encadre(await confirmerObservation(joueurId, joueur.zoneActuelleId, groupeId))] });
      return;
    } else if (clic.customId === "fouiller") {
      await clic.update({ components: [ecranFouille] });
    } else if (clic.isButton() && (clic.customId === "soigner" || clic.customId === "fouiller-corps")) {
      const resultat =
        clic.customId === "soigner" ? await formulaireSoin(clic, joueurId) : await formulaireFouilleCorps(clic, joueurId);
      if (resultat === null) continue; // formulaire ferme ou expire : le menu reste en place
      if (!resultat.soumission) {
        await clic.update({
          components: [
            encadre(`${entete}\n\n${resultat.texte}`).addActionRowComponents(
              new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour()),
            ),
          ],
        });
        continue;
      }
      if (resultat.soumission.isFromMessage()) await resultat.soumission.editReply({ components: [encadre(resultat.texte)] });
      return;
    } else if (clic.customId === "maire") {
      await clic.update({ components: [ecranMaire] });
    } else if (clic.isButton() && (clic.customId === "bannir" || clic.customId === "executer" || clic.customId === "accueil")) {
      const enAttente = clic.customId === "accueil" ? await demandeEnAttente(joueurId) : null;
      const resultat = enAttente
        ? { soumission: null, texte: `🏘️ Votre demande auprès de **${enAttente.ville.nom}** attend encore la réponse de son maire.` }
        : clic.customId === "accueil"
          ? await formulaireAccueil(clic, joueurId)
          : await formulaireSanction(clic, joueurId, clic.customId === "bannir" ? TypeElection.BANNISSEMENT : TypeElection.EXECUTION);
      if (resultat === null) continue; // formulaire ferme ou expire : le menu reste en place
      if (!resultat.soumission) {
        await clic.update({
          components: [
            encadre(`${entete}\n\n${resultat.texte}`).addActionRowComponents(
              new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour()),
            ),
          ],
        });
        continue;
      }
      if (resultat.soumission.isFromMessage()) await resultat.soumission.editReply({ components: [encadre(resultat.texte)] });
      return;
    } else if (clic.isButton() && (clic.customId === "rationner" || clic.customId === "prioriser")) {
      const resultat =
        clic.customId === "rationner" ? await formulaireRationnement(clic, joueurId) : await formulairePriorite(clic, joueurId);
      if (resultat === null) continue;
      if (resultat.soumission.isFromMessage()) await resultat.soumission.editReply({ components: [encadre(resultat.texte)] });
      return;
    } else if (clic.isButton() && clic.customId === "annonce") {
      const resultat = await formulaireAnnonce(clic, joueurId);
      if (resultat === null) continue; // formulaire ferme ou expire : le menu reste en place
      if (resultat.soumission.isFromMessage()) await resultat.soumission.editReply({ components: [encadre(resultat.texte)] });
      return;
    } else if (clic.customId === "election") {
      await clic.update({ components: [ecranElection] });
    } else if (clic.customId === "confirmer-election") {
      await clic.deferUpdate();
      await clic.editReply({ components: [encadre(await declencherElectionJoueur(guild, joueurId))] });
      return;
    } else if (clic.customId === "defiance") {
      await clic.update({ components: [ecranDefiance] });
    } else if (clic.customId === "confirmer-defiance") {
      await clic.deferUpdate();
      await clic.editReply({ components: [encadre(await declencherDefiance(guild, joueurId))] });
      return;
    } else if (clic.customId === "garde") {
      await clic.update({ components: [ecranGarde] });
    } else if (clic.customId === "confirmer-garde") {
      await clic.deferUpdate();
      await clic.editReply({ components: [encadre(await monterLaGarde(guild, joueurId))] });
      return;
    } else if (clic.customId === "feu") {
      await clic.update({ components: [ecranFeu] });
    } else if (clic.customId === "confirmer-feu") {
      await clic.deferUpdate();
      await clic.editReply({ components: [encadre(await allumerFeu(guild, joueurId))] });
      return;
    } else if (clic.customId === "piege") {
      await clic.update({ components: [ecranPiege] });
    } else if (clic.customId.startsWith("poser-piege:") || clic.customId === "relever-piege" || clic.customId === "appater-piege") {
      await clic.deferUpdate();
      const type = piegesAPoser.find((t) => clic.customId === `poser-piege:${t}`);
      const resultat =
        clic.customId === "relever-piege"
          ? await releverPiege(guild, joueurId)
          : clic.customId === "appater-piege"
            ? await appaterPiege(joueurId)
          : type
            ? await poserPiege(guild, joueurId, type)
            : "Ce piège n'est plus dans votre sac.";
      await clic.editReply({ components: [encadre(resultat)] });
      return;
    } else if (clic.customId === "sieste") {
      await clic.deferUpdate();
      if (!(await afficherResultat(clic, joueurId, await faireSieste(joueurId)))) return;
    } else if (clic.customId === "quitter-ville") {
      await clic.update({ components: [ecranQuitter] });
    } else if (clic.customId === "confirmer-quitter") {
      await clic.deferUpdate();
      await clic.editReply({ components: [encadre(await quitterVilleVivant(guild, joueurId))] });
      return;
    } else if (clic.customId === "confirmer-fouille") {
      await clic.deferUpdate();
      if (!(await afficherResultat(clic, joueurId, await confirmerFouille(guild, joueurId, joueur.zoneActuelleId)))) return;
    } else if (clic.isStringSelectMenu() && clic.customId === "aller") {
      destination = destinations.find((d) => valeur(d) === clic.values[0]);
      if (!destination) return;
      // Confirmation avant de depenser des PA (conception.md §4). La nuit, une torche du sac permet de payer
      // le cout de jour (equilibrage.md §6).
      const coutTorche = coutDeplacement(destination.palier, TypePhase.JOUR, destination.vierge, joueur.metier);
      const torchePossible = torches > 0 && coutTorche < destination.cout && coutTorche <= paActuel;
      const boutons = [
        ...(destination.cout <= paActuel
          ? [new ButtonBuilder().setCustomId("confirmer").setLabel(`Y aller (${destination.cout} PA)`).setStyle(ButtonStyle.Primary)]
          : []),
        ...(torchePossible
          ? [
              new ButtonBuilder()
                .setCustomId("confirmer-torche")
                .setLabel(`Avec une torche (${coutTorche} PA)`)
                .setEmoji("🔥")
                .setStyle(ButtonStyle.Primary),
            ]
          : []),
      ];
      await clic.update({
        components: [
          boutons.length === 0
            ? encadre(
                `${entete}\n\nIl vous faut **${destination.cout} PA** pour aller vers ${destination.nom} (vous en avez ${paActuel}).`,
              ).addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(boutonRetour()))
            : encadre(
                `${entete}\n\nAller vers **${destination.nom}** pour **${destination.cout} PA** ?` +
                  (destination.vierge && joueur.metier !== Metier.ECLAIREUR
                    ? `\n🗺️ Zone absente de votre carte : **+${SURCOUT_ZONE_VIERGE} PA** pour s'aventurer en terrain inconnu.`
                    : "") +
                  (torchePossible ? `\n🔥 Avec une torche (vous en avez ${torches}), le trajet ne coûte que **${coutTorche} PA**.` : ""),
              ).addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...boutons, boutonRetour())),
        ],
      });
    } else if ((clic.customId === "confirmer" || clic.customId === "confirmer-torche") && destination) {
      const avecTorche = clic.customId === "confirmer-torche";
      await clic.deferUpdate();
      const texte = await confirmerDeplacement(guild, joueurId, joueur.zoneActuelleId, groupeId, destination, avecTorche);
      if (!(await afficherResultat(clic, joueurId, texte))) return;
    } else if (clic.customId === "attaquer" || clic.customId === "tirer" || clic.customId === "fuir") {
      await clic.deferUpdate();
      const resultat =
        clic.customId === "attaquer"
          ? await attaquer(guild, joueurId)
          : clic.customId === "tirer"
            ? await tirer(guild, joueurId)
            : await fuir(guild, joueurId);
      if (!(await afficherResultat(clic, joueurId, resultat.texte))) return;
    }
  }
}

// Compte rendu d'une action : ecran de combat si le joueur est (toujours) face a un zombie, texte seul sinon. Renvoie
// true si le combat continue (le message reste a l'ecoute des boutons « Attaquer » et « Fuir »).
// Clic arrive sur un menu deja remplace par un /action plus recent : refuse sans rien executer
async function menuRemplace(interaction: ChatInputCommandInteraction, clic: MessageComponentInteraction): Promise<boolean> {
  if (menuOuvert.get(interaction.user.id) === interaction) return false;
  await clic.update({ components: [encadre(MESSAGE_MENU_FERME)], attachments: [] }).catch(() => null);
  return true;
}

// Ouverture d'un nouveau menu : vide l'ancien (son jeton de reponse reste valable 15 min) et l'oublie
async function fermerMenuPrecedent(interaction: ChatInputCommandInteraction) {
  const precedent = menuOuvert.get(interaction.user.id);
  menuOuvert.set(interaction.user.id, interaction);
  if (precedent) await precedent.editReply({ components: [encadre(MESSAGE_MENU_FERME)], attachments: [] }).catch(() => null);
}

async function afficherResultat(clic: MessageComponentInteraction, joueurId: number, texte: string): Promise<boolean> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  const enCombat = joueur.rencontrePvZombie !== null && (joueur.statut === StatutJoueur.VIVANT || joueur.statut === StatutJoueur.EXCLU);
  await clic.editReply({ components: [enCombat ? await ecranCombat(joueurId, texte) : encadre(texte)], attachments: [] });
  return enCombat;
}

// Deplacement confirme : reverification (phase, PA ou position ont pu changer pendant la confirmation), puis
// execution. Avec une torche, la nuit, le trajet coute le prix de jour et la torche est consommee. Renvoie le
// texte a afficher au joueur.
const confirmerDeplacement = verrouille(async function confirmerDeplacement(
  guild: Guild,
  joueurId: number,
  zoneDepartId: number | null,
  groupeId: number,
  destination: Destination,
  avecTorche: boolean,
): Promise<string> {
  const actuel = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const ville = actuel.ville!;
  const nuit = ville.phaseActuelle === TypePhase.NUIT;
  const torche =
    avecTorche && nuit
      ? await prisma.inventaireJoueur.findFirst({ where: { joueurId, objet: { nom: OBJET_TORCHE }, quantite: { gt: 0 } } })
      : null;
  if (avecTorche && nuit && !torche) return "Vous n'avez plus de torche : relancez `/action`.";
  // Vierge reverifie : la zone a pu rejoindre sa carte (observation, partage) pendant la confirmation
  const vierge =
    destination.id !== null &&
    !(await prisma.carteDecouverte.findFirst({ where: { joueurId, zoneId: destination.id }, select: { id: true } }));
  const cout = coutDeplacement(destination.palier, torche ? TypePhase.JOUR : ville.phaseActuelle, vierge, actuel.metier);
  const depuisActuel = await destinationsDepuis(groupeId, actuel.zoneActuelleId);
  const toujoursAccessible =
    destination.id === null ? depuisActuel.ville : depuisActuel.zones.some((z) => z.id === destination.id);
  const paRestants = (actuel.paActuel ?? 0) - cout;

  if (actuel.statut !== StatutJoueur.VIVANT && actuel.statut !== StatutJoueur.EXCLU) return "Vous ne pouvez plus vous déplacer.";
  if (actuel.zoneActuelleId !== zoneDepartId || !toujoursAccessible) return "Votre position a changé entre-temps : relancez `/action`.";
  if (actuel.rencontrePvZombie !== null) return MESSAGE_ZOMBIE;
  if (paRestants < 0) return `Il vous faut **${cout} PA** pour ce déplacement.`;

  if (torche) await prisma.inventaireJoueur.update({ where: { id: torche.id }, data: { quantite: { decrement: 1 } } });
  const pendaison = await deplacerJoueur(guild, actuel, destination.id, cout);
  if (pendaison) return pendaison;
  await prisma.journalEntree.create({
    data: {
      villeId: ville.id,
      joueurId,
      message: `Déplacement : ${destination.id === null ? "retour en ville" : destination.nom}`,
      public: false, // rien de public en territoire externe (conception.md §7)
    },
  });

  const bilan = `−${cout} PA, ${paRestants} restants${torche ? ", une torche consumée 🔥" : ""}`;
  // Un citoyen transforme en zombie qui rode sur place se jette aussitot sur l'arrivant (discord/zombieErrant.ts)
  const transforme = await zombieErrantALArrivee(guild, joueurId, ville.id, destination.id);
  if (destination.id === null) {
    const retour = `🏠 Vous êtes rentré à **${ville.nom}** (${bilan}).`;
    return transforme ? `${retour}\n\n${transforme}` : retour;
  }
  const salon = await trouverSalonTexte(guild, `salon:zone:${destination.id}`);
  const arrivee =
    `🧭 Vous êtes arrivé : **${destination.nom}**${salon ? ` — ${salon}` : ""} (${bilan}).\n` +
    "Tant que vous êtes dehors, vous ne pouvez plus écrire dans les salons de la ville.";
  if (transforme) return `${arrivee}\n\n${transforme}`;
  // Zombie a l'arrivee ; en cas de fuite, le joueur rebrousse chemin vers la zone (ou la ville) d'ou il vient
  const repli = { zoneId: zoneDepartId, ville: zoneDepartId === null };
  const rencontre = await declencherRencontre(joueurId, destination.palier!, ville.phaseActuelle, repli, false);
  return rencontre ? `${arrivee}\n\n${rencontre}` : arrivee;
});

// Observation confirmee : reverification, puis PA depenses, zones adjacentes ajoutees a la carte et survivants
// presents dans chacune affiches. Renvoie le texte a afficher au joueur.
const confirmerObservation = verrouille(async function confirmerObservation(joueurId: number, zoneDepartId: number | null, groupeId: number): Promise<string> {
  const actuel = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, zoneActuelle: true } });
  const ville = actuel.ville!;
  const cout = coutObservation(ville.phaseActuelle, actuel.metier);
  const paRestants = (actuel.paActuel ?? 0) - cout;

  if (actuel.statut !== StatutJoueur.VIVANT && actuel.statut !== StatutJoueur.EXCLU) return "Vous ne pouvez plus observer les environs.";
  if (actuel.zoneActuelleId !== zoneDepartId) return "Votre position a changé entre-temps : relancez `/action`.";
  if (actuel.rencontrePvZombie !== null) return MESSAGE_ZOMBIE;
  if (paRestants < 0) return `Il vous faut **${cout} PA** pour observer les environs.`;

  const { zones } = await destinationsDepuis(groupeId, actuel.zoneActuelleId);
  await prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: cout } } });
  const connuesAvant = new Set(
    (await prisma.carteDecouverte.findMany({ where: { joueurId, zoneId: { in: zones.map((z) => z.id) } } })).map((c) => c.zoneId),
  );
  const nouvelles = await ajouterACarte(joueurId, zones.map((z) => z.id));
  const presents = await prisma.joueur.groupBy({
    by: ["zoneActuelleId"],
    where: {
      zoneActuelleId: { in: zones.map((z) => z.id) },
      statut: { in: [StatutJoueur.VIVANT, StatutJoueur.EXCLU] },
      dateSortie: null,
      id: { not: joueurId },
    },
    _count: { _all: true },
  });
  const nbPresents = (zoneId: number) => presents.find((p) => p.zoneActuelleId === zoneId)?._count._all ?? 0;

  const depuis = actuel.zoneActuelle ? actuel.zoneActuelle.nom : ville.nom;
  await prisma.journalEntree.create({
    data: { villeId: ville.id, joueurId, message: `Observation des environs depuis ${depuis}`, public: false },
  });

  const lignes = zones.map((z) => {
    const n = nbPresents(z.id);
    return `• **${z.nom}** — ${n === 0 ? "personne en vue" : `👥 ${n} survivant${n > 1 ? "s" : ""}`}${connuesAvant.has(z.id) ? "" : " 🆕"}`;
  });
  return (
    `👁️ Depuis **${depuis}**, vous observez les environs (−${cout} PA, ${paRestants} restants) :\n${lignes.join("\n")}\n\n` +
    (nouvelles > 0 ? `🗺️ ${nouvelles} nouvelle(s) zone(s) ajoutée(s) à votre carte (\`/carte\`).` : "🗺️ Vous connaissiez déjà toutes ces zones.")
  );
});

// Fouille confirmee : reverification, puis PA depenses et objets tires ajoutes au sac dans l'ordre du tirage, tant
// qu'ils rentrent (equilibrage.md §5, « Poids et capacite ») ; ceux qui ne rentrent pas sont perdus.
// Renvoie le texte a afficher au joueur.
const confirmerFouille = verrouille(async function confirmerFouille(guild: Guild, joueurId: number, zoneDepartId: number | null): Promise<string> {
  const actuel = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, zoneActuelle: true } });
  const ville = actuel.ville!;
  const zone = actuel.zoneActuelle;
  const cout = coutFouille(ville.phaseActuelle);
  const paRestants = (actuel.paActuel ?? 0) - cout;

  if (actuel.statut !== StatutJoueur.VIVANT && actuel.statut !== StatutJoueur.EXCLU) return "Vous ne pouvez plus fouiller.";
  if (!zone || actuel.zoneActuelleId !== zoneDepartId) return "Votre position a changé entre-temps : relancez `/action`.";
  if (actuel.rencontrePvZombie !== null) return MESSAGE_ZOMBIE;
  if (paRestants < 0) return `Il vous faut **${cout} PA** pour fouiller la zone.`;
  const sac = await chargeSac(joueurId);
  if (sacPlein(sac)) return `${MESSAGE_SAC_PLEIN} (${libelleCharge(sac)}).`;
  const type = typeDeZone(zone.nom);
  if (!type) throw new Error(`Type de zone inconnu : ${zone.nom}`);

  // Chaque objet tire puise dans le stock de la zone (naturel ou fini) ; stock vide, il ne rapporte rien
  const { obtenus, restants } = puiserDansLesStocks(tirerLoot(LOOT_PAR_ZONE[type.cle][zone.palier]), type.cle, stocksActuels(zone));

  // Un objet trop lourd pour la place restante est laisse, mais un plus leger tire ensuite peut encore rentrer
  const trouves = new Map<string, number>();
  const laisses = new Map<string, number>();
  for (const nom of obtenus) {
    const poids = poidsObjet(nom);
    const cible = deborde(sac, poids) ? laisses : trouves;
    if (cible === trouves) sac.utilisee += poids;
    cible.set(nom, (cible.get(nom) ?? 0) + 1);
  }
  const objets = await prisma.objet.findMany({ where: { nom: { in: [...trouves.keys()] } } });
  const liste = (quantites: Map<string, number>) => [...quantites].map(([nom, n]) => `${emojiObjet(nom)} **${nom}** × ${n}`).join("\n");
  const texteLaisses = laisses.size > 0 ? `\n\nVotre sac est trop lourd pour le reste, laissé sur place :\n${liste(laisses)}` : "";
  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: cout } } }),
    prisma.zone.update({ where: { id: zone.id }, data: { stockNaturel: restants.naturel, stockFini: restants.fini } }),
    ...objets.map((objet) =>
      prisma.inventaireJoueur.upsert({
        where: { joueurId_objetId: { joueurId, objetId: objet.id } },
        update: { quantite: { increment: trouves.get(objet.nom)! } },
        create: { joueurId, objetId: objet.id, quantite: trouves.get(objet.nom)! },
      }),
    ),
    prisma.journalEntree.create({
      data: {
        villeId: ville.id,
        joueurId,
        message:
          `Fouille de ${zone.nom} : ${objets.length > 0 ? objets.map((o) => `${o.nom} ×${trouves.get(o.nom)}`).join(", ") : "rien"}` +
          (laisses.size > 0 ? ` (laissé faute de place : ${[...laisses].map(([nom, n]) => `${nom} ×${n}`).join(", ")})` : ""),
        public: false, // rien de public en territoire externe (conception.md §7)
      },
    }),
  ]);
  if (trouves.has(OBJET_RADIO)) await synchroniserAccesJoueur(guild, joueurId);

  const compteRendu =
    trouves.size === 0 && laisses.size === 0
      ? `🔍 Vous fouillez **${zone.nom}**… sans rien trouver d'utile (−${cout} PA, ${paRestants} restants).`
      : trouves.size === 0
        ? `🔍 Vous fouillez **${zone.nom}** (−${cout} PA, ${paRestants} restants).${texteLaisses}`
        : `🔍 Vous fouillez **${zone.nom}** (−${cout} PA, ${paRestants} restants) et trouvez :\n${liste(trouves)}` +
          `\n\n🎒 Rangé dans votre sac (${libelleCharge(sac)}, \`/inventaire\`).${texteLaisses}`;
  const indices = indicesStocks(zone.palier, restants);
  const bilan = indices.length > 0 ? `${compteRendu}\n\n${indices.join("\n")}` : compteRendu;
  // Le bruit attire parfois un zombie ; en cas de fuite, le joueur reste dans la zone
  const rencontre = await declencherRencontre(joueurId, zone.palier, ville.phaseActuelle, { zoneId: null, ville: false }, true);
  return rencontre ? `${bilan}\n\n${rencontre}` : bilan;
});

// Sortie volontaire d'un vivant ou d'un exclu (conception.md §3) : annoncee dans la mairie, puis depart definitif
const quitterVilleVivant = verrouille(async function quitterVilleVivant(guild: Guild, joueurId: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const ville = joueur.ville!;
  if (joueur.dateSortie !== null) return "Vous avez déjà quitté cette ville.";
  await prisma.journalEntree.create({ data: { villeId: ville.id, joueurId, message: "A quitté la ville" } });
  await posterDansMairie(guild, ville.id, `🚪 <@${joueur.utilisateur.discordId}> a quitté **${ville.nom}** pour toujours.`);
  const villeTombee = await sortirDeVille(guild, joueurId);
  return (
    `🚪 Vous avez quitté **${ville.nom}**.` +
    (villeTombee ? " Vous en étiez le dernier habitant vivant : la ville est tombée." : "") +
    "\nVous pouvez rejoindre une ville depuis #fonder-une-colonie ou en créer une avec `/creer-ville`."
  );
});

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
  if (await menuRemplace(interaction, clic)) return;

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

  await sortirDeVille(guild, joueur.id);

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
    if (await estMjActif(guild, interaction.user.id)) {
      await interaction.reply({ content: MESSAGE_MJ_ACTIF_NE_JOUE_PAS, flags: MessageFlags.Ephemeral });
      return;
    }

    const maintenant = Date.now();
    const attente = (derniereOuverture.get(interaction.user.id) ?? 0) + DELAI_ENTRE_ACTIONS_MS - maintenant;
    if (attente > 0) {
      await interaction.reply({
        content: `⏳ Patientez encore ${Math.ceil(attente / 1000)} s avant de rouvrir \`/action\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    derniereOuverture.set(interaction.user.id, maintenant);

    const utilisateur = await trouverOuCreerUtilisateur(interaction.user);
    const joueur = await trouverJoueurActif(utilisateur.id);
    if (!joueur?.ville) {
      await interaction.reply({
        content: "Vous n'avez pas de personnage actif. Créez une ville avec `/creer-ville` ou rejoignez-en une depuis #fonder-une-colonie.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await fermerMenuPrecedent(interaction);
    if (joueur.statut === StatutJoueur.VIVANT || joueur.statut === StatutJoueur.EXCLU) {
      await actionsVivant(interaction, guild, joueur.id);
    } else {
      await actionsMort(interaction, guild, joueur.id);
    }
  },
};

export default command;
