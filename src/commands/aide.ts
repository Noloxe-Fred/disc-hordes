import { StatutDemande, StatutJoueur, StatutVille, TypePhase } from "@prisma/client";
import { ContainerBuilder, MessageFlags, SeparatorBuilder, SlashCommandBuilder, TextDisplayBuilder, type Guild } from "discord.js";
import type { Command } from "../client";
import { prisma } from "../db";
import { estMaireEnExercice } from "../discord/annonce";
import { estAdmin, estMjActif, estMjInactif, estMjOuAdmin } from "../discord/permissions";
import { trouverSalonTexte } from "../discord/reconcile";
import {
  SALON_ANNONCES,
  SALON_COMMEMORATION,
  SALON_DISCUSSION_MJ,
  SALON_ETRANGER_PORTES,
  SALON_FONDER_COLONIE,
  SALON_GENERAL,
  SALON_GESTION,
  SALON_NOUVEL_HABITANT,
  SALON_REGLES,
  SALON_SIGNALEMENTS,
} from "../discord/structure";
import { trouverJoueurActif } from "../services/joueur";
import { trouverOuCreerUtilisateur } from "../services/utilisateur";

// /aide : les commandes utiles selon l'etat du joueur (nomade, en recrutement, en ville, dehors, face a un zombie,
// exclu, mort, MJ), et ce qu'on fait dans le salon ou elle est tapee (retrouve par sa cle dans RessourceDiscord).

const COULEUR_AIDE = 0x3498db;

const SIGNALER = "🚩 `/signaler` : signaler un comportement problématique à l'équipe";

// Lien cliquable vers un salon, ou son nom s'il n'existe pas (encore)
async function lienSalon(guild: Guild, cle: string, nom: string): Promise<string> {
  const salon = await trouverSalonTexte(guild, cle);
  return salon ? `${salon}` : `#${nom}`;
}

// Salons fixes du serveur : ce qu'on y fait
const SALONS_FIXES: Record<string, string> = {
  [SALON_REGLES.cle]: "Les règles du jeu, à relire à tout moment. Le sommaire en tête renvoie à chaque section.",
  [SALON_GENERAL.cle]: "Discussion libre entre tous les joueurs du serveur.",
  [SALON_NOUVEL_HABITANT.cle]: "Le mot de bienvenue de chaque nouveau membre. Lecture seule.",
  [SALON_FONDER_COLONIE.cle]:
    "Les villes en recrutement : demande à en rejoindre une avec son bouton, ou crée la tienne avec `/creer-ville`.",
  [SALON_ETRANGER_PORTES.cle]: "Les demandes d'inscription aux villes en recrutement. Lecture seule.",
  [SALON_COMMEMORATION.cle]: "Le souvenir des villes tombées : durée de survie, maires, pire attaque, destin de chaque habitant.",
  [SALON_ANNONCES.cle]: "Les annonces de l'équipe du serveur. Lecture seule.",
  [SALON_SIGNALEMENTS.cle]: "Les signalements des joueurs (`/signaler`) : le bouton **Marquer traité** range ceux qui sont réglés.",
  [SALON_DISCUSSION_MJ.cle]: "Discussion entre MJ et Admins.",
  [SALON_GESTION.cle]: "Gestion du serveur, réservée aux Admins.",
};

// Salons d'une ville : la cle est "salon:ville:<id>:<suffixe>"
const SALONS_VILLE: Record<string, string> = {
  mairie:
    "La mairie : annonces de la ville et du maire, comptes rendus d'attaque, panneaux d'élection et de défiance, demandes d'accueil. Lecture seule.",
  journal: "Le journal de bord : ce que les citoyens font en ville, inscrit chaque minute par le bot. Lecture seule.",
  banque: "La banque : la réserve commune, toujours à jour ; ses boutons **Déposer**, **Tout déposer** et **Retirer** marchent depuis la ville.",
  "place-publique": "La place publique : on s'y organise entre citoyens. Les partages de carte y sont annoncés.",
  chantiers:
    "Les chantiers : le panneau montre chaque bâtiment ; ses boutons **Contribuer** (sac ou banque) et **Installer** le font avancer.",
  "maisons-privees":
    "Les maisons privées : bâtis ta maison avec les boutons du panneau (**Contribuer**, **Installer**), **Ma maison** montre où tu en es.",
  atelier: "L'atelier : lance `/inventaire` ici, en ville, pour le bouton **Craft avancé** et les recettes de ton métier (la réparation d'une arme à feu est ouverte à tous).",
};

async function texteSalon(guild: Guild, salonId: string | null): Promise<string | null> {
  if (!salonId) return null;
  const ressource = await prisma.ressourceDiscord.findFirst({ where: { guildId: guild.id, discordId: salonId } });
  if (!ressource) return null;
  const cle = ressource.cle;
  if (SALONS_FIXES[cle]) return SALONS_FIXES[cle];
  const ville = /^salon:ville:\d+:(.+)$/.exec(cle);
  if (ville && SALONS_VILLE[ville[1]]) return SALONS_VILLE[ville[1]];
  if (/^salon:zone:\d+$/.test(cle)) {
    return "Une zone du territoire : seuls les survivants présents la voient. Rencontres, horde et réponses d'accueil y sont annoncées.";
  }
  if (/^salon:groupe:\d+:radio$/.test(cle)) {
    return "Les ondes radio : les porteurs de radio de la région s'y parlent d'une zone à l'autre (et toute la ville, une fois la tour radio construite).";
  }
  return null;
}

// Commandes du joueur selon son etat
async function texteJoueur(guild: Guild, utilisateurId: number): Promise<string> {
  const fonder = await lienSalon(guild, SALON_FONDER_COLONIE.cle, SALON_FONDER_COLONIE.nom);
  const joueur = await trouverJoueurActif(utilisateurId);

  if (!joueur?.ville) {
    const demande = await prisma.demandeInscription.findFirst({
      where: { utilisateurId, statut: StatutDemande.EN_ATTENTE },
      include: { ville: true },
    });
    return (
      "## 🧭 Tu es Nomade\n" +
      (demande
        ? `Ta demande pour rejoindre **${demande.ville.nom}** attend la réponse de la ville.\n`
        : `🏘️ Rejoins une ville en recrutement depuis ${fonder}\n🏗️ \`/creer-ville\` : crée ta ville et lance son recrutement\n`) +
      "❓ `/aide` : cette aide, selon le salon et ta situation\n" +
      SIGNALER
    );
  }

  const ville = joueur.ville;
  const communes =
    "🧍 `/personnage` : tes PV, PA, faim, soif et le temps avant la prochaine phase\n" +
    "❓ `/aide` : cette aide, selon le salon et ta situation\n" +
    SIGNALER;

  if (ville.statut !== StatutVille.ACTIVE) {
    return (
      `## ⏳ ${ville.nom} recrute\n` +
      `Ta ville n'est pas encore fondée : les actions s'ouvriront à sa fondation. Suis son recrutement dans ${fonder}.\n` +
      communes
    );
  }

  if (joueur.statut === StatutJoueur.MORT) {
    return (
      "## 💀 Tu es mort\n" +
      `Tu vois toujours **${ville.nom}** sans pouvoir y agir.\n` +
      "⚡ `/action` : quitter définitivement ta ville pour en rejoindre ou en créer une autre avec un nouveau personnage\n" +
      communes
    );
  }

  const inventaire = "🎒 `/inventaire` : ton sac, pour fabriquer, donner, manger ou boire";
  if (joueur.rencontrePvZombie !== null) {
    return (
      "## 🧟 Un zombie te barre la route\n" +
      "⚡ `/action` : **Attaquer**, **Tirer** (arme à feu et munitions) ou **Fuir**, rien d'autre tant qu'il est là\n" +
      `${inventaire}\n${communes}`
    );
  }

  const nuit = ville.phaseActuelle === TypePhase.NUIT;
  const exclu = joueur.statut === StatutJoueur.EXCLU;
  if (joueur.zoneActuelle) {
    return (
      `## 🌲 Dehors — ${joueur.zoneActuelle.nom}\n` +
      (exclu ? `Tu es **exclu** de ${ville.nom} : tu ne peux pas y rentrer.\n` : "") +
      "⚡ `/action` : te déplacer, observer, fouiller une zone ou un corps, voir ta carte, soigner, allumer un feu ou faire la sieste, " +
      "demander l'accueil d'une ville\n" +
      `${inventaire}\n${communes}` +
      (exclu ? "" : `\n${nuit ? "🌙" : "☀️"} Rentre en ville avant l'aube : la horde frappe ceux qui sont dehors.`)
    );
  }

  const chantiers = await lienSalon(guild, `salon:ville:${ville.id}:chantiers`, "chantiers");
  const maisons = await lienSalon(guild, `salon:ville:${ville.id}:maisons-privees`, "maisons-privées");
  const banque = await lienSalon(guild, `salon:ville:${ville.id}:banque`, "banque");
  const maire = estMaireEnExercice(joueur);
  return (
    `## 🏙️ En ville — ${ville.nom}\n` +
    "⚡ `/action` : sortir, voir et partager ta carte, soigner, " +
    (nuit ? "monter la garde, " : "") +
    "lancer une élection ou une défiance" +
    (maire ? ", agir en **maire** (annonce, bannissement, exécution, rationnement, priorité)" : "") +
    ", quitter ta ville\n" +
    "🎒 `/inventaire` : ton sac et la banque de la ville, pour fabriquer, donner, déposer en banque, jeter, manger ou boire\n" +
    `${communes}\n` +
    `🏦 La réserve commune s'affiche dans ${banque}.
` +
    `🏗️ Les bâtiments avancent dans ${chantiers}, ta maison dans ${maisons}.`
  );
}

// Commandes du staff
async function texteStaff(guild: Guild, userId: string): Promise<string | null> {
  const admin = await estAdmin(guild, userId);
  const mj = await estMjOuAdmin(guild, userId);
  const mjInactif = await estMjInactif(guild, userId);
  if (!admin && !mj && !mjInactif) return null;
  return (
    "## 🛡️ Équipe\n" +
    (mj ? "🎲 `/mj` : le panneau MJ (outils MJ, actions de jeu ouvertes aux MJ)\n" : "") +
    (mjInactif ? "🎲 `/mj` : redevenir MJ actif\n" : "") +
    (admin ? "⚙️ `/admin` : le panneau d'administration\n" : "")
  ).trimEnd();
}

const command: Command = {
  data: new SlashCommandBuilder().setName("aide").setDescription("Les commandes utiles selon le salon et votre situation"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    const ici = await texteSalon(guild, interaction.channelId);
    const joueur = (await estMjActif(guild, interaction.user.id))
      ? "## 🛡️ Tu es MJ actif\nTu vois tout le jeu, tu ne peux donc pas jouer. Passe en MJ inactif depuis `/mj` pour jouer."
      : await texteJoueur(guild, (await trouverOuCreerUtilisateur(interaction.user)).id);
    const staff = await texteStaff(guild, interaction.user.id);
    const regles = await lienSalon(guild, SALON_REGLES.cle, SALON_REGLES.nom);

    const conteneur = new ContainerBuilder().setAccentColor(COULEUR_AIDE);
    if (ici) {
      conteneur
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📍 Ici\n${ici}`))
        .addSeparatorComponents(new SeparatorBuilder());
    }
    conteneur.addTextDisplayComponents(new TextDisplayBuilder().setContent(joueur));
    if (staff) {
      conteneur.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(staff));
    }
    conteneur.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Le détail de chaque règle est dans ${regles}.`));

    await interaction.reply({ components: [conteneur], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
};

export default command;
