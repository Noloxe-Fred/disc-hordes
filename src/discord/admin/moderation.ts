import { StatutVille } from "@prisma/client";
import {
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import { prisma } from "../../db";
import { rafraichirMessageVille } from "../messageVille";
import { sortirDeVille } from "../sortie";
import {
  champChoix,
  champMembre,
  confirmer,
  journaliser,
  lireChoix,
  lireJoueur,
  lireMembre,
  ouvrirFormulaire,
  repondre,
  type FamilleAdmin,
} from "./outils";

// Famille "Moderation" du panneau /admin (conception.md §4) : rendre muet, retirer un joueur de la partie,
// consulter le journal des actions admin.

const COULEUR_JOURNAL = 0xe67e22; // orange du role Admin
const ENTREES_JOURNAL_AFFICHEES = 20;

// Durees proposees ; "0" leve le mute. Discord plafonne l'exclusion temporaire a 28 jours.
const DUREES_MUTE = [
  { label: "10 minutes", value: String(10 * 60_000) },
  { label: "1 heure", value: String(60 * 60_000) },
  { label: "6 heures", value: String(6 * 60 * 60_000) },
  { label: "24 heures", value: String(24 * 60 * 60_000) },
  { label: "7 jours", value: String(7 * 24 * 60 * 60_000) },
  { label: "Lever le mute", value: "0" },
];

// --- Mute : exclusion temporaire Discord (plus d'ecriture, de reaction ni de vocal) ---

async function mute(interaction: ButtonInteraction, guild: Guild) {
  const soumission = await ouvrirFormulaire(interaction, "Rendre muet", [champMembre("Membre"), champChoix("duree", "Durée", DUREES_MUTE)]);
  if (!soumission) return;

  const utilisateur = lireMembre(soumission);
  const membre = utilisateur ? await guild.members.fetch(utilisateur.id).catch(() => null) : null;
  if (!membre) {
    await repondre(soumission, "Ce membre n'est plus sur le serveur.");
    return;
  }
  const duree = Number(lireChoix(soumission, "duree"));
  const libelleDuree = DUREES_MUTE.find((d) => d.value === String(duree))?.label ?? "?";

  if (!membre.moderatable) {
    await repondre(soumission, `Impossible de rendre muet ${membre} : son rôle est au-dessus de celui du bot, ou c'est un administrateur.`);
    return;
  }
  await membre.timeout(duree > 0 ? duree : null, `Panneau /admin (${interaction.user.username})`);

  await journaliser(interaction.user, duree > 0 ? "Rendre muet" : "Lever le mute", `${membre.user.username}${duree > 0 ? ` (${libelleDuree})` : ""}`);
  await repondre(soumission, duree > 0 ? `${membre} est muet pour ${libelleDuree}.` : `${membre} n'est plus muet.`);
}

// --- Kick (jeu) : retire le joueur de sa ville, sans l'exclure du serveur Discord ---

async function kick(interaction: ButtonInteraction, guild: Guild) {
  const soumission = await ouvrirFormulaire(interaction, "Retirer un joueur de la partie", [champMembre()]);
  if (!soumission) return;

  const joueur = await lireJoueur(soumission, [StatutVille.EN_CREATION, StatutVille.ACTIVE]);
  if (!joueur?.ville) {
    await repondre(soumission, "Ce membre n'a pas de personnage dans une ville en création ou en jeu.");
    return;
  }
  const ville = joueur.ville;
  const mention = `<@${joueur.utilisateur.discordId}>`;
  if (ville.statut === StatutVille.EN_CREATION && ville.createurUtilisateurId === joueur.utilisateurId) {
    await repondre(soumission, `${mention} a créé **${ville.nom}** : effacez plutôt la ville (famille Ville).`);
    return;
  }

  const choix = await confirmer(
    soumission,
    `⚠️ **Retirer ${mention} de ${ville.nom}** : il perd son personnage et l'accès à la ville, et redevient Nomade. ` +
      "S'il en était le dernier habitant vivant, la ville tombe.",
    "Retirer de la partie",
  );
  if (!choix) return;

  if (ville.statut === StatutVille.EN_CREATION) {
    // Aucun role attribue avant la fondation : seule l'inscription disparait
    await prisma.joueur.delete({ where: { id: joueur.id } });
    await rafraichirMessageVille(guild, ville.id);
  } else {
    await sortirDeVille(guild, joueur.id);
  }

  await journaliser(interaction.user, "Kick (jeu)", `${joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId} (${ville.nom})`);
  await choix.editReply(`${mention} a été retiré de **${ville.nom}**.`);
}

// --- Journal des actions admin ---

async function consulterJournal(interaction: ButtonInteraction) {
  const entrees = await prisma.journalAdmin.findMany({ orderBy: { date: "desc" }, take: ENTREES_JOURNAL_AFFICHEES });
  const lignes = entrees.map(
    (e) => `<t:${Math.floor(e.date.getTime() / 1000)}:f> · <@${e.adminDiscordId}> · **${e.action}** — ${e.details}`.slice(0, 180),
  );

  await interaction.reply({
    components: [
      new ContainerBuilder()
        .setAccentColor(COULEUR_JOURNAL)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 📜 Journal des actions admin\n` +
              (lignes.length > 0 ? `${ENTREES_JOURNAL_AFFICHEES} dernières actions au plus :\n${lignes.join("\n")}` : "Aucune action enregistrée."),
          ),
        ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

export const FAMILLE_MODERATION: FamilleAdmin = {
  cle: "moderation",
  titre: "Modération",
  emoji: "⚖️",
  resume: "mute, retrait d'un joueur de la partie, journal des actions admin",
  actions: [
    {
      cle: "mute",
      libelle: "Mute joueur",
      description: "exclusion temporaire Discord d'un membre (10 min à 7 jours), ou levée du mute.",
      style: ButtonStyle.Danger,
      executer: mute,
    },
    {
      cle: "kick",
      libelle: "Kick joueur (jeu)",
      description: "retire un joueur de sa ville (personnage et accès), sans l'exclure du serveur.",
      style: ButtonStyle.Danger,
      executer: kick,
    },
    {
      cle: "journal",
      libelle: "Logs d'actions admin",
      description: `affiche les ${ENTREES_JOURNAL_AFFICHEES} dernières actions faites depuis ce panneau.`,
      executer: consulterJournal,
    },
  ],
};
