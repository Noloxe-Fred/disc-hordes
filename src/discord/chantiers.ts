import { StatutJoueur, StatutVille, TypeBatiment } from "@prisma/client";
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
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import { calculerDepot, CHANTIERS, chantier, objetsUtiles, ressourceDeposee, type Chantier } from "../config/batiments";
import {
  BONUS_STRUCTURE_DEFENSE,
  BONUS_STRUCTURE_RENFORCEE,
  bonusStructures,
  OBJET_STRUCTURE_DEFENSE,
  OBJET_STRUCTURE_RENFORCEE,
  STRUCTURES_DEFENSE_MAX,
} from "../config/defense";
import { emojiObjet, poidsObjet } from "../config/objets";
import { SEUIL_CRITIQUE_FAIM_SOIF } from "../config/sante";
import { prisma } from "../db";
import { chargeBanque } from "../services/charge";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";
import { champQuantite, champsObjetsPossedes, lireObjetPossede, lireQuantite } from "./champsObjets";
import { synchroniserAccesVille } from "./joueurDiscord";
import { estMjActif, MESSAGE_MJ_ACTIF_NE_JOUE_PAS } from "./permissions";
import { trouverSalonTexte } from "./reconcile";
import { texteRationnement } from "./maire";
import { rafraichirPanneauMaisons } from "./maisons";
import { ensureSalonJournal, posterDansMairie, synchroniserSalonAtelier } from "./villeStructure";

// Chantiers communautaires (conception.md §5, equilibrage.md §7) : un panneau permanent dans #chantiers de chaque ville,
// mis a jour a chaque avancee. « Contribuer (sac) » / « Contribuer (banque) » deposent des ressources sur le prochain
// palier d'un batiment (gratuit), « Installer » y verse des PA, au fur et a mesure des depots (2 PA par tranche de 10
// ressources deposees). Palier construit quand ressources et PA sont complets : son bonus s'applique aussitot.
// Reserve aux citoyens vivants presents en ville, hors seuil critique de faim ou de soif.

const COULEUR = 0xd35400;
const DELAI_FORMULAIRE_MS = 180_000;

type Source = "sac" | "banque";

interface EtatChantier {
  chantier: Chantier;
  palier: number; // palier construit
  deposees: Map<string, number>;
  paInstalles: number;
}

async function etatsChantiers(villeId: number): Promise<EtatChantier[]> {
  const batiments = await prisma.batimentVille.findMany({
    where: { villeId },
    include: { contributions: { include: { objet: true } } },
  });
  return CHANTIERS.map((c) => {
    const b = batiments.find((x) => x.type === c.type);
    return {
      chantier: c,
      palier: b?.palierActuel ?? 0,
      deposees: new Map(b?.contributions.map((x) => [x.objet.nom, x.quantiteDeposee]) ?? []),
      paInstalles: b?.paInstalles ?? 0,
    };
  });
}

function prochainPalier(etat: EtatChantier) {
  return etat.chantier.paliers[etat.palier] ?? null;
}

function totalDeposees(etat: EtatChantier): number {
  return [...etat.deposees.values()].reduce((a, b) => a + b, 0);
}

// PA qu'on peut deja verser : 2 par tranche de 10 ressources deposees, sans depasser le cout du palier
function paInstallables(etat: EtatChantier): number {
  const suivant = prochainPalier(etat);
  if (!suivant) return 0;
  return Math.min(suivant.pa, Math.floor((totalDeposees(etat) * 2) / 10)) - etat.paInstalles;
}

function manque(etat: EtatChantier, nom: string): number {
  const besoin = prochainPalier(etat)?.ressources[nom] ?? 0;
  return Math.max(0, besoin - (etat.deposees.get(nom) ?? 0));
}

function ligneChantier(etat: EtatChantier, prioritaire: boolean): string {
  const { chantier: c, palier } = etat;
  const titre = `${c.emoji} **${c.nom}** — palier ${palier} / ${c.paliers.length}` + (prioritaire ? " · ⭐ **prioritaire**" : "");
  // Bonus du palier atteint (les bonus de palissade indiquent deja le total cumule)
  const actif = palier > 0 ? `\n✅ Actif : ${c.paliers[palier - 1].bonus}` : "\n-# Pas encore construit";
  const suivant = prochainPalier(etat);
  if (!suivant) return `${titre} — terminé${actif}`;
  const ressources = Object.entries(suivant.ressources)
    .map(([nom, n]) => `${emojiObjet(nom)} ${etat.deposees.get(nom) ?? 0}/${n}`)
    .join(" · ");
  return `${titre}${actif}\n⏳ Palier ${palier + 1} : ${suivant.bonus}\n${ressources} · ⚡ ${etat.paInstalles}/${suivant.pa} PA`;
}

export async function construirePanneauChantiers(villeId: number): Promise<ContainerBuilder> {
  const etats = await etatsChantiers(villeId);
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: villeId } });
  const { structuresDefense, structuresRenforcees } = ville;
  const posees = structuresDefense + structuresRenforcees;
  // Decisions du maire (informatives, discord/maire.ts)
  const decisions = [
    ...(ville.chantierPrioritaire ? [`⭐ Chantier prioritaire : ${chantier(ville.chantierPrioritaire).emoji} **${chantier(ville.chantierPrioritaire).nom}**`] : []),
    ...(ville.rationnementActif ? [`🍽️ Rationnement : ${texteRationnement(ville)}`] : []),
  ];
  const structures =
    `🛡️ **Structures de défense** — ${posees} / ${STRUCTURES_DEFENSE_MAX} posées` +
    (structuresRenforcees > 0 ? ` (dont ${structuresRenforcees} renforcée${structuresRenforcees > 1 ? "s" : ""})` : "") +
    ` : +${bonusStructures(structuresDefense, structuresRenforcees)} défense\n-# Fabriquées par un ingénieur à l'atelier, posées avec le bouton ` +
    `ci-dessous : +${BONUS_STRUCTURE_DEFENSE} défense chacune, +${BONUS_STRUCTURE_RENFORCEE} pour une renforcée, jusqu'à ce qu'une attaque ` +
    "mal contenue la détruise. Une structure renforcée posée quand tout est plein remplace une structure simple.";
  return new ContainerBuilder()
    .setAccentColor(COULEUR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🏗️ Chantiers de la ville\n" +
          "Déposez des ressources (depuis votre sac ou la banque, gratuit), puis installez-les avec vos PA : " +
          "2 PA par tranche de 10 ressources déposées. Un palier est construit quand tout est réuni.\n\n" +
          (decisions.length > 0 ? `📋 **Décisions du maire**\n${decisions.join("\n")}\n\n` : "") +
          etats.map((e) => ligneChantier(e, e.chantier.type === ville.chantierPrioritaire)).join("\n\n") +
          `\n\n${structures}`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`chantier:sac:${villeId}`).setLabel("Contribuer (sac)").setEmoji("🎒").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`chantier:banque:${villeId}`).setLabel("Contribuer (banque)").setEmoji("🏦").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`chantier:installer:${villeId}`).setLabel("Installer").setEmoji("🔨").setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`chantier:structure:${villeId}`)
          .setLabel("Poser une structure")
          .setEmoji("🛡️")
          .setStyle(ButtonStyle.Secondary)
          // Plein : une structure renforcee peut encore remplacer une simple
          .setDisabled(posees >= STRUCTURES_DEFENSE_MAX && structuresDefense === 0),
      ),
    );
}

// Poste le panneau dans #chantiers, ou le met a jour s'il existe deja
export async function rafraichirPanneauChantiers(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.findUnique({ where: { id: villeId } });
  if (!ville || ville.statut !== StatutVille.ACTIVE) return;
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:chantiers`);
  if (!salon) return;
  const panneau = { components: [await construirePanneauChantiers(villeId)], flags: MessageFlags.IsComponentsV2 as const };
  const existant = ville.messageChantiersId ? await salon.messages.fetch(ville.messageChantiersId).catch(() => null) : null;
  if (existant) {
    await existant.edit({ components: panneau.components }).catch(() => null);
    return;
  }
  const message = await salon.send(panneau).catch(() => null);
  if (message) await prisma.ville.update({ where: { id: villeId }, data: { messageChantiersId: message.id } });
}

// Panneaux (chantiers, maisons) et salons (atelier, journal) de chaque ville en jeu (au demarrage du bot : villes fondees avant les chantiers, message supprime...)
export async function rafraichirTousLesPanneaux(guild: Guild): Promise<void> {
  for (const { id } of await prisma.ville.findMany({ where: { statut: StatutVille.ACTIVE }, select: { id: true } })) {
    await rafraichirPanneauChantiers(guild, id).catch((error) => console.error(`Panneau des chantiers de la ville ${id}`, error));
    await rafraichirPanneauMaisons(guild, id).catch((error) => console.error(`Panneau des maisons de la ville ${id}`, error));
    await synchroniserSalonAtelier(guild, id).catch((error) => console.error(`Salon atelier de la ville ${id}`, error));
    await ensureSalonJournal(guild, id).catch((error) => console.error(`Salon journal de la ville ${id}`, error));
  }
}

// Citoyen autorise a travailler sur les chantiers de cette ville, ou raison du refus
async function ouvrier(interaction: ButtonInteraction, villeId: number) {
  if (await estMjActif(interaction.guild!, interaction.user.id)) return { refus: MESSAGE_MJ_ACTIF_NE_JOUE_PAS };
  const utilisateur = await trouverOuCreerUtilisateur(interaction.user);
  const joueur = await trouverJoueurActif(utilisateur.id);
  if (!joueur || joueur.villeId !== villeId) return { refus: "Ces chantiers ne sont pas ceux de votre ville." };
  if (joueur.statut !== StatutJoueur.VIVANT) return { refus: "Seuls les citoyens vivants travaillent sur les chantiers." };
  if (joueur.zoneActuelleId !== null) return { refus: "Rentrez en ville pour travailler sur les chantiers." };
  if (joueur.rencontrePvZombie !== null) return { refus: "🧟 Un zombie vous occupe : réglez-le d'abord dans `/action`." };
  if (joueur.faim < SEUIL_CRITIQUE_FAIM_SOIF || joueur.soif < SEUIL_CRITIQUE_FAIM_SOIF) {
    return { refus: "Vous êtes trop affamé ou assoiffé pour travailler sur les chantiers (faim et soif doivent être d'au moins 10)." };
  }
  return { joueur };
}

function champBatiment(etats: EtatChantier[]): LabelBuilder {
  return new LabelBuilder().setLabel("Quel chantier ?").setStringSelectMenuComponent(
    new StringSelectMenuBuilder()
      .setCustomId("batiment")
      .setRequired(true)
      .addOptions(
        etats.map((e) => ({
          label: `${e.chantier.nom} — palier ${e.palier + 1}`,
          value: e.chantier.type,
          emoji: e.chantier.emoji,
          description: (prochainPalier(e)?.bonus ?? "").slice(0, 100),
        })),
      ),
  );
}

// Clic sur un bouton du panneau : "chantier:<sac|banque|installer>:<villeId>"
export async function gererBoutonChantier(interaction: ButtonInteraction, action: string, idBrut: string): Promise<void> {
  const villeId = Number(idBrut);
  if (!interaction.guild || !Number.isInteger(villeId)) return;
  const { refus, joueur } = await ouvrier(interaction, villeId);
  if (refus || !joueur) {
    await interaction.reply({ content: refus, flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === "structure") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(await poserStructure(interaction.guild, joueur.id, villeId));
    return;
  }
  const etats = (await etatsChantiers(villeId)).filter((e) => prochainPalier(e) !== null);
  if (etats.length === 0) {
    await interaction.reply({ content: "Tous les chantiers sont terminés.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === "sac" || action === "banque") await contribuer(interaction, joueur.id, villeId, action, etats);
  else if (action === "installer") await installer(interaction, joueur.id, villeId, etats);
}

async function contribuer(interaction: ButtonInteraction, joueurId: number, villeId: number, source: Source, etats: EtatChantier[]) {
  const utiles = objetsUtiles(etats.flatMap((e) => Object.keys(prochainPalier(e)!.ressources)));
  const stock = (
    source === "sac"
      ? await prisma.inventaireJoueur.findMany({ where: { joueurId, quantite: { gt: 0 } }, include: { objet: true }, orderBy: { objet: { nom: "asc" } } })
      : await prisma.inventaireVille.findMany({ where: { villeId, quantite: { gt: 0 } }, include: { objet: true }, orderBy: { objet: { nom: "asc" } } })
  ).filter((e) => utiles.has(e.objet.nom));
  if (stock.length === 0) {
    await interaction.reply({
      content: `${source === "sac" ? "Votre sac" : "La banque"} ne contient aucune ressource utile aux chantiers (${[...utiles].join(", ")}).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const champsObjets = champsObjetsPossedes(stock, "Quelle ressource ?");
  const idFormulaire = `chantier:${interaction.id}`;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle(source === "sac" ? "Contribuer depuis le sac" : "Contribuer depuis la banque")
      .addLabelComponents(champBatiment(etats), ...champsObjets, champQuantite()),
  );
  const soumission = await interaction
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return;
  // Accuse reception tout de suite : terminer un palier (salon, acces des habitants) peut depasser les 3 s de Discord
  await soumission.deferReply({ flags: MessageFlags.Ephemeral });
  const type = soumission.fields.getStringSelectValues("batiment")[0] as TypeBatiment;
  const objetId = lireObjetPossede(soumission, champsObjets.length);
  const quantite = lireQuantite(soumission);
  const texte =
    objetId === null
      ? "Choisissez une seule ressource."
      : quantite === null
        ? "La quantité doit être un nombre entier positif."
        : await deposer(interaction.guild!, joueurId, villeId, source, type, objetId, quantite);
  await soumission.editReply(texte);
}

// Depot : reverification, puis au plus ce qui manque encore au palier ; le surplus reste dans le sac ou la banque. Un
// objet qui tient lieu d'une ressource (Bois rare : 5 Bois) est credite sur cette ressource.
async function deposer(
  guild: Guild,
  joueurId: number,
  villeId: number,
  source: Source,
  type: TypeBatiment,
  objetId: number,
  quantite: number,
): Promise<string> {
  const etat = (await etatsChantiers(villeId)).find((e) => e.chantier.type === type);
  const objet = await prisma.objet.findUniqueOrThrow({ where: { id: objetId } });
  const nom = `${emojiObjet(objet.nom)} ${objet.nom}`;
  if (!etat || !prochainPalier(etat)) return "Ce chantier est terminé.";
  const { ressource: nomRessource } = ressourceDeposee(objet.nom);
  const ressource = await prisma.objet.findUniqueOrThrow({ where: { nom: nomRessource } });
  const besoin = manque(etat, nomRessource);
  if (besoin === 0) return `Le ${etat.chantier.nom.toLowerCase()} n'a plus besoin de ${emojiObjet(nomRessource)} ${nomRessource} pour ce palier.`;
  const disponible =
    source === "sac"
      ? ((await prisma.inventaireJoueur.findUnique({ where: { joueurId_objetId: { joueurId, objetId } } }))?.quantite ?? 0)
      : ((await prisma.inventaireVille.findUnique({ where: { villeId_objetId: { villeId, objetId } } }))?.quantite ?? 0);
  const { pris: verse, credit } = calculerDepot(objet.nom, besoin, quantite, disponible);
  if (verse <= 0) return `${source === "sac" ? "Vous n'avez plus" : "La banque n'a plus"} de ${nom}.`;

  const batiment = await prisma.batimentVille.upsert({
    where: { villeId_type: { villeId, type } },
    update: {},
    create: { villeId, type },
  });
  await prisma.$transaction([
    source === "sac"
      ? prisma.inventaireJoueur.update({ where: { joueurId_objetId: { joueurId, objetId } }, data: { quantite: { decrement: verse } } })
      : prisma.inventaireVille.update({ where: { villeId_objetId: { villeId, objetId } }, data: { quantite: { decrement: verse } } }),
    prisma.contributionBatiment.upsert({
      where: { batimentVilleId_objetId: { batimentVilleId: batiment.id, objetId: ressource.id } },
      update: { quantiteDeposee: { increment: credit } },
      create: { batimentVilleId: batiment.id, objetId: ressource.id, quantiteDeposee: credit },
    }),
    prisma.journalEntree.create({
      data: { villeId, joueurId, message: `Chantier ${etat.chantier.nom} : ${objet.nom} ×${verse}${source === "banque" ? " (banque)" : ""}` },
    }),
  ]);
  const termine = await terminerSiComplet(guild, villeId, type, joueurId);
  await rafraichirPanneauChantiers(guild, villeId);
  return (
    `🏗️ Vous déposez **${nom} × ${verse}** sur le chantier **${etat.chantier.nom}**` +
    (credit !== verse ? ` (${credit} ${emojiObjet(nomRessource)} ${nomRessource})` : "") +
    (source === "banque" ? " (pris à la banque)" : "") +
    "." +
    (verse < quantite ? ` Le reste n'était pas nécessaire${verse < disponible ? "" : " ou manquait"}.` : "") +
    (termine ? `\n${termine}` : "")
  );
}

async function installer(interaction: ButtonInteraction, joueurId: number, villeId: number, etats: EtatChantier[]) {
  const installables = etats.filter((e) => paInstallables(e) > 0);
  if (installables.length === 0) {
    await interaction.reply({
      content: "Aucun chantier n'a de ressources à installer : déposez d'abord des ressources (2 PA par tranche de 10).",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const idFormulaire = `installer:${interaction.id}`;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle("Installer (PA)")
      .addLabelComponents(
        champBatiment(installables),
        new LabelBuilder()
          .setLabel("Combien de PA ?")
          .setDescription(`Au plus ce que les ressources déposées permettent (2 PA par tranche de 10)`)
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
  const type = soumission.fields.getStringSelectValues("batiment")[0] as TypeBatiment;
  const pa = lireQuantite(soumission);
  const texte = pa === null ? "Le nombre de PA doit être un entier positif." : await verserPa(interaction.guild!, joueurId, villeId, type, pa);
  await soumission.editReply(texte);
}

// Installation : au plus les PA installables (ressources deposees) et ceux du joueur
async function verserPa(guild: Guild, joueurId: number, villeId: number, type: TypeBatiment, pa: number): Promise<string> {
  const etat = (await etatsChantiers(villeId)).find((e) => e.chantier.type === type);
  if (!etat || !prochainPalier(etat)) return "Ce chantier est terminé.";
  const possible = paInstallables(etat);
  if (possible <= 0) return `Déposez d'abord des ressources sur le chantier **${etat.chantier.nom}** : 2 PA par tranche de 10.`;
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  const verse = Math.min(pa, possible, joueur.paActuel ?? 0);
  if (verse <= 0) return "Vous n'avez plus de PA.";

  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: verse } } }),
    prisma.batimentVille.update({ where: { villeId_type: { villeId, type } }, data: { paInstalles: { increment: verse } } }),
    prisma.journalEntree.create({ data: { villeId, joueurId, message: `Chantier ${etat.chantier.nom} : ${verse} PA d'installation` } }),
  ]);
  const termine = await terminerSiComplet(guild, villeId, type, joueurId);
  await rafraichirPanneauChantiers(guild, villeId);
  return (
    `🔨 Vous installez **${verse} PA** sur le chantier **${etat.chantier.nom}** (${(joueur.paActuel ?? 0) - verse} PA restants).` +
    (verse < pa ? ` Seuls ${verse} PA pouvaient être versés pour l'instant.` : "") +
    (termine ? `\n${termine}` : "")
  );
}

// Palier complet (ressources et PA) : palier construit, avancement remis a zero, annonce dans #chantiers et la mairie
async function terminerSiComplet(guild: Guild, villeId: number, type: TypeBatiment, joueurId: number): Promise<string | null> {
  const etat = (await etatsChantiers(villeId)).find((e) => e.chantier.type === type)!;
  const suivant = prochainPalier(etat);
  if (!suivant) return null;
  const ressourcesOk = Object.keys(suivant.ressources).every((nom) => manque(etat, nom) === 0);
  if (!ressourcesOk || etat.paInstalles < suivant.pa) return null;

  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { utilisateur: true } });
  return construirePalier(guild, villeId, type, `Dernière pierre posée par <@${joueur.utilisateur.discordId}>.`);
}

// Palier suivant construit (chantier complet, ou forcé depuis /admin) : avancement remis a zero, annonce dans #chantiers
// (suivie de la signature) et la mairie, effets immediats du batiment. Null si le batiment est deja au dernier palier.
export async function construirePalier(guild: Guild, villeId: number, type: TypeBatiment, signature: string): Promise<string | null> {
  const etat = (await etatsChantiers(villeId)).find((e) => e.chantier.type === type)!;
  const suivant = prochainPalier(etat);
  if (!suivant) return null;

  const batiment = await prisma.batimentVille.upsert({
    where: { villeId_type: { villeId, type } },
    create: { villeId, type },
    update: {},
  });
  await prisma.$transaction([
    prisma.contributionBatiment.deleteMany({ where: { batimentVilleId: batiment.id } }),
    prisma.batimentVille.update({ where: { id: batiment.id }, data: { palierActuel: { increment: 1 }, paInstalles: 0 } }),
  ]);
  const c = chantier(type);
  const annonce = `🏗️ Chantier terminé : **${c.emoji} ${c.nom}** atteint le **palier ${etat.palier + 1}** ! Bonus actif : ${suivant.bonus}.`;
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:chantiers`);
  await salon?.send({ content: `${annonce} ${signature}`, allowedMentions: { parse: [] } }).catch(() => null);
  await posterDansMairie(guild, villeId, annonce);
  // L'atelier construit ouvre son salon, ou se fait le craft avance
  if (type === TypeBatiment.ATELIER) await synchroniserSalonAtelier(guild, villeId);
  // La Tour Radio ouvre les ondes a tous les habitants et la ville aux porteurs de radio dehors
  if (type === TypeBatiment.TOUR_RADIO) await synchroniserAccesVille(guild, villeId);
  return annonce;
}

// Structure du sac, sinon de la banque, ou null
async function structureDisponible(joueurId: number, villeId: number, nom: string) {
  const objet = await prisma.objet.findUniqueOrThrow({ where: { nom } });
  const sac = await prisma.inventaireJoueur.findUnique({ where: { joueurId_objetId: { joueurId, objetId: objet.id } } });
  if (sac && sac.quantite > 0) return { source: "sac" as const, id: sac.id };
  const banque = await prisma.inventaireVille.findUnique({ where: { villeId_objetId: { villeId, objetId: objet.id } } });
  return banque && banque.quantite > 0 ? { source: "banque" as const, id: banque.id } : null;
}

// Structure de defense posee (sac, puis banque), renforcee de preference : +3 defense pour une simple, +5 pour une
// renforcee (jusqu'a sa destruction par une attaque, discord/degatsChantiers.ts), 5 au plus toutes confondues. Ville
// pleine, une renforcee detruit une structure simple pour prendre sa place.
async function poserStructure(guild: Guild, joueurId: number, villeId: number): Promise<string> {
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: villeId } });
  const plein = ville.structuresDefense + ville.structuresRenforcees >= STRUCTURES_DEFENSE_MAX;
  const renforcee = await structureDisponible(joueurId, villeId, OBJET_STRUCTURE_RENFORCEE);
  const simple = renforcee ? null : await structureDisponible(joueurId, villeId, OBJET_STRUCTURE_DEFENSE);
  const choix = renforcee ?? simple;
  if (!choix) {
    return (
      `Il faut une ${emojiObjet(OBJET_STRUCTURE_DEFENSE)} **${OBJET_STRUCTURE_DEFENSE}** ou une ${emojiObjet(OBJET_STRUCTURE_RENFORCEE)} ` +
      `**${OBJET_STRUCTURE_RENFORCEE}** dans votre sac ou dans la banque (fabriquées par un ingénieur à l'atelier).`
    );
  }
  const remplace = plein && renforcee !== null;
  if (plein && (!renforcee || ville.structuresDefense === 0)) {
    return `La ville a déjà ${STRUCTURES_DEFENSE_MAX} structures de défense${renforcee ? ", toutes renforcées" : ""} : c'est le maximum.`;
  }

  const nom = renforcee ? OBJET_STRUCTURE_RENFORCEE : OBJET_STRUCTURE_DEFENSE;
  const bonus = renforcee ? BONUS_STRUCTURE_RENFORCEE : BONUS_STRUCTURE_DEFENSE;
  const simples = ville.structuresDefense + (renforcee ? (remplace ? -1 : 0) : 1);
  const renforcees = ville.structuresRenforcees + (renforcee ? 1 : 0);
  const banque = choix.source === "banque";
  // La structure simple remplacee rend ses ressources de construction a la banque, tant qu'il y a de la place
  const recuperation = remplace ? await recupererStructureSimple(villeId, joueurId, banque ? poidsObjet(OBJET_STRUCTURE_RENFORCEE) : 0) : null;
  await prisma.$transaction([
    ...(recuperation?.operations ?? []),
    banque
      ? prisma.inventaireVille.update({ where: { id: choix.id }, data: { quantite: { decrement: 1 } } })
      : prisma.inventaireJoueur.update({ where: { id: choix.id }, data: { quantite: { decrement: 1 } } }),
    prisma.ville.update({ where: { id: villeId }, data: { structuresDefense: simples, structuresRenforcees: renforcees } }),
    prisma.journalEntree.create({
      data: { villeId, joueurId, message: `${nom} posée${remplace ? " à la place d'une structure simple" : ""}${banque ? " (banque)" : ""}` },
    }),
  ]);
  const total = bonusStructures(simples, renforcees);
  const gain = remplace ? bonus - BONUS_STRUCTURE_DEFENSE : bonus;
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { utilisateur: true } });
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:chantiers`);
  await salon
    ?.send({
      content:
        `🛡️ <@${joueur.utilisateur.discordId}> pose une ${nom.toLowerCase()}${remplace ? " à la place d'une structure simple" : ""} : ` +
        `+${gain} défense (total +${total}).` +
        (recuperation ? ` ${recuperation.texte}` : ""),
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
  await rafraichirPanneauChantiers(guild, villeId);
  return (
    `🛡️ Vous posez une ${emojiObjet(nom)} ${nom.toLowerCase()}${banque ? " prise à la banque" : ""}` +
    (remplace ? ", qui remplace une structure simple démontée pour lui faire place" : "") +
    ` : **+${gain} défense** pour la ville (total +${total}).` +
    (recuperation ? `\n${recuperation.texte}` : "")
  );
}

// Structure simple demontee : ses ingredients de fabrication reviennent a la banque dans l'ordre de la recette, tant
// qu'ils y tiennent ; le reste est perdu. liberePoids : poids qui quitte la banque dans la meme operation (structure
// renforcee prise a la banque).
async function recupererStructureSimple(villeId: number, joueurId: number, liberePoids: number) {
  const recette = await prisma.recette.findUnique({
    where: { nom: OBJET_STRUCTURE_DEFENSE },
    include: { ingredients: { include: { objet: true } } },
  });
  const charge = await chargeBanque(villeId);
  let libre = charge.capacite - charge.utilisee + liberePoids;
  const rendus: string[] = [];
  const perdus: string[] = [];
  const operations = [];
  for (const i of recette?.ingredients ?? []) {
    const poids = poidsObjet(i.objet.nom);
    const rendu = Math.max(0, Math.min(i.quantite, poids > 0 ? Math.floor(libre / poids) : i.quantite));
    libre -= rendu * poids;
    const libelle = (n: number) => `${n} ${emojiObjet(i.objet.nom)} ${i.objet.nom}`;
    if (rendu > 0) {
      rendus.push(libelle(rendu));
      operations.push(
        prisma.inventaireVille.upsert({
          where: { villeId_objetId: { villeId, objetId: i.objetId } },
          update: { quantite: { increment: rendu } },
          create: { villeId, objetId: i.objetId, quantite: rendu },
        }),
      );
    }
    if (rendu < i.quantite) perdus.push(libelle(i.quantite - rendu));
  }
  if (rendus.length > 0) {
    operations.push(prisma.journalEntree.create({ data: { villeId, joueurId, message: `Structure simple démontée : ${rendus.join(", ")} rendus à la banque` } }));
  }
  const texte =
    rendus.length === 0
      ? `🏦 La banque est pleine : ses ressources (${perdus.join(", ")}) sont perdues.`
      : `🏦 Ses ressources reviennent à la banque : ${rendus.join(", ")}.` +
        (perdus.length > 0 ? ` Faute de place, perdu : ${perdus.join(", ")}.` : "");
  return { operations, texte };
}
