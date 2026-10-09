import { StatutJoueur, StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import { calculerDepot, objetsUtiles, PA_PAR_RESSOURCE, PALIERS_MAISON, ressourceDeposee, type PalierBatiment } from "../config/batiments";
import { emojiObjet } from "../config/objets";
import { SEUIL_CRITIQUE_FAIM_SOIF } from "../config/sante";
import { prisma } from "../db";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { champQuantite, champsObjetsPossedes, lireObjetPossede, lireQuantite } from "./champsObjets";
import { estMjActif, MESSAGE_MJ_ACTIF_NE_JOUE_PAS } from "./permissions";
import { trouverSalonTexte } from "./reconcile";
import { rafraichirPanneauBanque } from "./banque";

// Maisons privees (equilibrage.md §7) : un panneau permanent dans #maisons-privees de chaque ville. Chaque joueur
// construit sa propre maison avec la mecanique des chantiers : « Contribuer (sac) » / « Contribuer (banque) » deposent
// des ressources sur le prochain palier (gratuit), « Installer » y verse des PA au fur et a mesure des depots (1 PA pour
// 2 ressources). « Ma maison » affiche la progression, visible du seul joueur. Les prises en banque sont
// journalisees comme pour les chantiers. Reserve aux citoyens vivants presents en ville, hors seuil critique.

const COULEUR = 0x8e5b3a;
const DELAI_FORMULAIRE_MS = 180_000;

type Source = "sac" | "banque";

interface EtatMaison {
  palier: number; // palier construit
  deposees: Map<string, number>;
  paInstalles: number;
}

async function etatMaison(joueurId: number): Promise<EtatMaison> {
  const joueur = await prisma.joueur.findUniqueOrThrow({
    where: { id: joueurId },
    include: { contributionsMaison: { include: { objet: true } } },
  });
  return {
    palier: joueur.maisonPalier,
    deposees: new Map(joueur.contributionsMaison.map((x) => [x.objet.nom, x.quantiteDeposee])),
    paInstalles: joueur.maisonPaInstalles,
  };
}

function prochainPalier(etat: EtatMaison): PalierBatiment | null {
  return PALIERS_MAISON[etat.palier] ?? null;
}

function totalDeposees(etat: EtatMaison): number {
  return [...etat.deposees.values()].reduce((a, b) => a + b, 0);
}

// PA qu'on peut deja verser : 1 pour 2 ressources deposees (arrondi au superieur), sans depasser le cout du palier
function paInstallables(etat: EtatMaison): number {
  const suivant = prochainPalier(etat);
  if (!suivant) return 0;
  return Math.min(suivant.pa, Math.ceil(totalDeposees(etat) * PA_PAR_RESSOURCE)) - etat.paInstalles;
}

function manque(etat: EtatMaison, nom: string): number {
  const besoin = prochainPalier(etat)?.ressources[nom] ?? 0;
  return Math.max(0, besoin - (etat.deposees.get(nom) ?? 0));
}

function coutPalier(p: PalierBatiment): string {
  return Object.entries(p.ressources)
    .map(([nom, n]) => `${emojiObjet(nom)} ${n} ${nom}`)
    .join(" + ");
}

function ligneMaison(etat: EtatMaison): string {
  const titre = `🏠 **Votre maison** — palier ${etat.palier} / ${PALIERS_MAISON.length}`;
  const actif = etat.palier > 0 ? `\n✅ Actif : ${PALIERS_MAISON[etat.palier - 1].bonus}` : "\n-# Pas encore construite";
  const suivant = prochainPalier(etat);
  if (!suivant) return `${titre} — terminée${actif}`;
  const ressources = Object.entries(suivant.ressources)
    .map(([nom, n]) => `${emojiObjet(nom)} ${etat.deposees.get(nom) ?? 0}/${n}`)
    .join(" · ");
  return `${titre}${actif}\n⏳ Palier ${etat.palier + 1} : ${suivant.bonus}\n${ressources} · ⚡ ${etat.paInstalles}/${suivant.pa} PA`;
}

export function construirePanneauMaisons(villeId: number): ContainerBuilder {
  const paliers = PALIERS_MAISON.map((p, i) => `**Palier ${i + 1}** : ${coutPalier(p)} · ⚡ ${p.pa} PA — ${p.bonus}`).join("\n");
  return new ContainerBuilder()
    .setAccentColor(COULEUR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🏠 Maisons privées\n" +
          "Chacun arrive sans maison et bâtit la sienne. Déposez des ressources (depuis votre sac ou la banque, gratuit), " +
          "puis installez-les avec vos PA : 1 PA pour 2 ressources déposées. Un palier est construit quand tout est réuni.\n\n" +
          paliers +
          "\n\n-# « Ma maison » affiche votre progression, visible de vous seul. Les ressources prises à la banque sont notées au journal de la ville.",
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`maison:voir:${villeId}`).setLabel("Ma maison").setEmoji("🏠").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`maison:sac:${villeId}`).setLabel("Contribuer (sac)").setEmoji("🎒").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`maison:banque:${villeId}`).setLabel("Contribuer (banque)").setEmoji("🏦").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`maison:installer:${villeId}`).setLabel("Installer").setEmoji("🔨").setStyle(ButtonStyle.Success),
      ),
    );
}

// Poste le panneau dans #maisons-privees, s'il n'y est pas deja (son contenu ne depend d'aucun etat)
export async function rafraichirPanneauMaisons(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.findUnique({ where: { id: villeId } });
  if (!ville || ville.statut !== StatutVille.ACTIVE) return;
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:maisons-privees`);
  if (!salon) return;
  const panneau = { components: [construirePanneauMaisons(villeId)], flags: MessageFlags.IsComponentsV2 as const };
  const existant = ville.messageMaisonsId ? await salon.messages.fetch(ville.messageMaisonsId).catch(() => null) : null;
  if (existant) {
    await existant.edit({ components: panneau.components }).catch(() => null);
    return;
  }
  const message = await salon.send(panneau).catch(() => null);
  if (message) await prisma.ville.update({ where: { id: villeId }, data: { messageMaisonsId: message.id } });
}

// Citoyen autorise a travailler sur sa maison dans cette ville, ou raison du refus
async function batisseur(interaction: ButtonInteraction, villeId: number) {
  if (await estMjActif(interaction.guild!, interaction.user.id)) return { refus: MESSAGE_MJ_ACTIF_NE_JOUE_PAS };
  const utilisateur = await trouverOuCreerUtilisateur(interaction.user);
  const joueur = await trouverJoueurActif(utilisateur.id);
  if (!joueur || joueur.villeId !== villeId) return { refus: "Votre maison n'est pas dans cette ville." };
  if (joueur.statut !== StatutJoueur.VIVANT) return { refus: "Seuls les citoyens vivants bâtissent leur maison." };
  return { joueur };
}

function refusTravail(joueur: { zoneActuelleId: number | null; rencontrePvZombie: number | null; faim: number; soif: number }): string | null {
  if (joueur.zoneActuelleId !== null) return "Rentrez en ville pour travailler sur votre maison.";
  if (joueur.rencontrePvZombie !== null) return "🧟 Un zombie vous occupe : réglez-le d'abord dans `/action`.";
  if (joueur.faim < SEUIL_CRITIQUE_FAIM_SOIF || joueur.soif < SEUIL_CRITIQUE_FAIM_SOIF) {
    return "Vous êtes trop affamé ou assoiffé pour travailler sur votre maison (faim et soif doivent être d'au moins 10).";
  }
  return null;
}

// Clic sur un bouton du panneau : "maison:<voir|sac|banque|installer>:<villeId>"
export async function gererBoutonMaison(interaction: ButtonInteraction, action: string, idBrut: string): Promise<void> {
  const villeId = Number(idBrut);
  if (!interaction.guild || !Number.isInteger(villeId)) return;
  const { refus, joueur } = await batisseur(interaction, villeId);
  if (refus || !joueur) {
    await interaction.reply({ content: refus, flags: MessageFlags.Ephemeral });
    return;
  }
  const etat = await etatMaison(joueur.id);
  if (action === "voir") {
    await interaction.reply({ content: ligneMaison(etat), flags: MessageFlags.Ephemeral });
    return;
  }
  const refusAction = refusTravail(joueur) ?? (prochainPalier(etat) ? null : "Votre maison est terminée.");
  if (refusAction) {
    await interaction.reply({ content: refusAction, flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === "sac" || action === "banque") await contribuer(interaction, joueur.id, villeId, action, etat);
  else if (action === "installer") await installer(interaction, joueur.id, villeId, etat);
}

async function contribuer(interaction: ButtonInteraction, joueurId: number, villeId: number, source: Source, etat: EtatMaison) {
  const utiles = objetsUtiles(Object.keys(prochainPalier(etat)!.ressources).filter((nom) => manque(etat, nom) > 0));
  const stock = (
    source === "sac"
      ? await prisma.inventaireJoueur.findMany({ where: { joueurId, quantite: { gt: 0 } }, include: { objet: true }, orderBy: { objet: { nom: "asc" } } })
      : await prisma.inventaireVille.findMany({ where: { villeId, quantite: { gt: 0 } }, include: { objet: true }, orderBy: { objet: { nom: "asc" } } })
  ).filter((e) => utiles.has(e.objet.nom));
  if (stock.length === 0) {
    await interaction.reply({
      content:
        utiles.size === 0
          ? "Toutes les ressources de ce palier sont déposées : installez-les avec « Installer »."
          : `${source === "sac" ? "Votre sac" : "La banque"} ne contient aucune ressource utile à votre maison (${[...utiles].join(", ")}).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const champsObjets = champsObjetsPossedes(stock, "Quelle ressource ?");
  const idFormulaire = `maison:${interaction.id}`;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle(source === "sac" ? "Maison : depuis le sac" : "Maison : depuis la banque")
      .addLabelComponents(...champsObjets, champQuantite()),
  );
  const soumission = await interaction
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return;
  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const objetId = lireObjetPossede(soumission, champsObjets.length);
  const quantite = lireQuantite(soumission);
  const texte =
    objetId === null
      ? "Choisissez une seule ressource."
      : quantite === null
        ? "La quantité doit être un nombre entier positif."
        : await deposer(interaction.guild!, joueurId, villeId, source, objetId, quantite);
  await soumission.editReply(texte);
}

// Depot : reverification, puis au plus ce qui manque encore au palier ; le surplus reste dans le sac ou la banque. Un
// objet qui tient lieu d'une ressource (Bois rare : 5 Bois) est credite sur cette ressource.
async function deposer(guild: Guild, joueurId: number, villeId: number, source: Source, objetId: number, quantite: number): Promise<string> {
  const etat = await etatMaison(joueurId);
  const objet = await prisma.objet.findUniqueOrThrow({ where: { id: objetId } });
  const nom = `${emojiObjet(objet.nom)} ${objet.nom}`;
  if (!prochainPalier(etat)) return "Votre maison est terminée.";
  const { ressource: nomRessource } = ressourceDeposee(objet.nom);
  const ressource = await prisma.objet.findUniqueOrThrow({ where: { nom: nomRessource } });
  const besoin = manque(etat, nomRessource);
  if (besoin === 0) return `Votre maison n'a plus besoin de ${emojiObjet(nomRessource)} ${nomRessource} pour ce palier.`;
  const disponible =
    source === "sac"
      ? ((await prisma.inventaireJoueur.findUnique({ where: { joueurId_objetId: { joueurId, objetId } } }))?.quantite ?? 0)
      : ((await prisma.inventaireVille.findUnique({ where: { villeId_objetId: { villeId, objetId } } }))?.quantite ?? 0);
  const { pris: verse, credit } = calculerDepot(objet.nom, besoin, quantite, disponible);
  if (verse <= 0) return `${source === "sac" ? "Vous n'avez plus" : "La banque n'a plus"} de ${nom}.`;

  await prisma.$transaction([
    source === "sac"
      ? prisma.inventaireJoueur.update({ where: { joueurId_objetId: { joueurId, objetId } }, data: { quantite: { decrement: verse } } })
      : prisma.inventaireVille.update({ where: { villeId_objetId: { villeId, objetId } }, data: { quantite: { decrement: verse } } }),
    prisma.contributionMaison.upsert({
      where: { joueurId_objetId: { joueurId, objetId: ressource.id } },
      update: { quantiteDeposee: { increment: credit } },
      create: { joueurId, objetId: ressource.id, quantiteDeposee: credit },
    }),
    prisma.journalEntree.create({
      data: { villeId, joueurId, message: `Maison privée : ${objet.nom} ×${verse}${source === "banque" ? " (banque)" : ""}` },
    }),
  ]);
  const termine = await terminerSiComplet(guild, villeId, joueurId);
  if (source === "banque") await rafraichirPanneauBanque(guild, villeId);
  return (
    `🏠 Vous déposez **${nom} × ${verse}** sur votre maison` +
    (credit !== verse ? ` (${credit} ${emojiObjet(nomRessource)} ${nomRessource})` : "") +
    (source === "banque" ? " (pris à la banque)" : "") +
    "." +
    (verse < quantite ? ` Le reste n'était pas nécessaire${verse < disponible ? "" : " ou manquait"}.` : "") +
    `\n${termine ?? ligneMaison(await etatMaison(joueurId))}`
  );
}

async function installer(interaction: ButtonInteraction, joueurId: number, villeId: number, etat: EtatMaison) {
  if (paInstallables(etat) <= 0) {
    await interaction.reply({
      content: "Aucune ressource à installer : déposez d'abord des ressources sur votre maison (1 PA pour 2 ressources).",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const idFormulaire = `installer-maison:${interaction.id}`;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle("Maison : installer (PA)")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Combien de PA ?")
          .setDescription(`Au plus ${paInstallables(etat)} PA avec les ressources déjà déposées`)
          .setTextInputComponent(
            new TextInputBuilder().setCustomId("quantite").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4).setPlaceholder("1"),
          ),
      ),
  );
  const soumission = await interaction
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return;
  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const pa = lireQuantite(soumission);
  const texte = pa === null ? "Le nombre de PA doit être un entier positif." : await verserPa(interaction.guild!, joueurId, villeId, pa);
  await soumission.editReply(texte);
}

// Installation : au plus les PA installables (ressources deposees) et ceux du joueur
async function verserPa(guild: Guild, joueurId: number, villeId: number, pa: number): Promise<string> {
  const etat = await etatMaison(joueurId);
  if (!prochainPalier(etat)) return "Votre maison est terminée.";
  const possible = paInstallables(etat);
  if (possible <= 0) return "Déposez d'abord des ressources sur votre maison : 1 PA pour 2 ressources.";
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  const verse = Math.min(pa, possible, joueur.paActuel ?? 0);
  if (verse <= 0) return "Vous n'avez plus de PA.";

  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: verse }, maisonPaInstalles: { increment: verse } } }),
    prisma.journalEntree.create({ data: { villeId, joueurId, message: `Maison privée : ${verse} PA d'installation` } }),
  ]);
  const termine = await terminerSiComplet(guild, villeId, joueurId);
  return (
    `🔨 Vous installez **${verse} PA** sur votre maison (${(joueur.paActuel ?? 0) - verse} PA restants).` +
    (verse < pa ? ` Seuls ${verse} PA pouvaient être versés pour l'instant.` : "") +
    `\n${termine ?? ligneMaison(await etatMaison(joueurId))}`
  );
}

// Palier complet (ressources et PA) : palier construit, avancement remis a zero, annonce dans #maisons-privees
async function terminerSiComplet(guild: Guild, villeId: number, joueurId: number): Promise<string | null> {
  const etat = await etatMaison(joueurId);
  const suivant = prochainPalier(etat);
  if (!suivant) return null;
  const ressourcesOk = Object.keys(suivant.ressources).every((nom) => manque(etat, nom) === 0);
  if (!ressourcesOk || etat.paInstalles < suivant.pa) return null;

  await prisma.$transaction([
    prisma.contributionMaison.deleteMany({ where: { joueurId } }),
    prisma.joueur.update({ where: { id: joueurId }, data: { maisonPalier: { increment: 1 }, maisonPaInstalles: 0 } }),
  ]);
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { utilisateur: true } });
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:maisons-privees`);
  await salon
    ?.send({
      content: `🏠 <@${joueur.utilisateur.discordId}> ${etat.palier === 0 ? "a bâti sa maison" : "a amélioré sa maison"} (palier ${etat.palier + 1}).`,
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
  return `🏠 Votre maison atteint le **palier ${etat.palier + 1}** ! ${suivant.bonus}.`;
}
