import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
} from "discord.js";
import { prisma } from "../db";
import { trouverJoueurActif } from "../services/joueur";
import { journaliser } from "./admin/outils";
import { construirePanneauMj, construirePanneauMjInactif } from "./boutonsAdmin";
import { synchroniserAccesJoueur } from "./joueurDiscord";
import { estMjActif, estMjInactif, estMjOuAdmin } from "./permissions";
import { publierRegles } from "./publicationRegles";
import { trouverRole } from "./reconcile";
import { ROLE_MJ, ROLE_MJ_INACTIF } from "./structure";

// Outils propres au panneau /mj (Components V2) : customId "mj:outils:<action>", routes par boutons.ts. Les droits
// sont reverifies a chaque clic, le panneau pouvant rester affiche longtemps. Un MJ bascule entre MJ actif (voit tout
// le jeu, ne joue pas) et MJ inactif (voit le serveur comme un joueur, plus discussion-mj) : le panneau d'un MJ inactif
// ne propose que le retour en MJ actif. Les actions de jeu ouvertes aux MJ passent par discord/boutonsAdmin.ts.

const COULEUR_MJ = 0xf1c40f; // or du role MJ

async function publierLesRegles(interaction: ButtonInteraction, guild: Guild) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply(await publierRegles(guild));
}

// Echange des roles MJ actif / MJ inactif, puis acces du personnage eventuel recalcules : ses restrictions de joueur
// (ville masquee dehors...) sont levees en MJ actif et reposees en MJ inactif.
async function basculerMj(interaction: ButtonInteraction, guild: Guild, versActif: boolean) {
  await interaction.deferUpdate();
  const membre = await guild.members.fetch(interaction.user.id);
  const [roleActif, roleInactif] = await Promise.all([trouverRole(guild, ROLE_MJ.cle), trouverRole(guild, ROLE_MJ_INACTIF.cle)]);
  if (!roleActif || !roleInactif) {
    await interaction.editReply({ components: [panneauTexte("Rôles MJ introuvables : un Admin doit relancer « Initialiser le serveur ».")] });
    return;
  }
  await membre.roles.add(versActif ? roleActif : roleInactif);
  await membre.roles.remove(versActif ? roleInactif : roleActif);

  const utilisateur = await prisma.utilisateur.findUnique({ where: { discordId: interaction.user.id } });
  const joueur = utilisateur ? await trouverJoueurActif(utilisateur.id) : null;
  if (joueur) await synchroniserAccesJoueur(guild, joueur.id);

  await journaliser(interaction.user, versActif ? "Redevenir MJ actif" : "Passer en MJ inactif", "");
  await interaction.editReply({
    components: [versActif ? construirePanneauMj({ mjActif: true }) : construirePanneauMjInactif()],
  });
}

function panneauTexte(texte: string): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(COULEUR_MJ).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte));
}

// Droit requis par action : les outils MJ pour un MJ actif ou un Admin, chaque bascule pour le role de depart
const ACTIONS = {
  regles: { droit: estMjOuAdmin, executer: publierLesRegles },
  inactif: { droit: estMjActif, executer: (i: ButtonInteraction, g: Guild) => basculerMj(i, g, false) },
  actif: { droit: estMjInactif, executer: (i: ButtonInteraction, g: Guild) => basculerMj(i, g, true) },
} as const;

export async function gererBoutonOutilMj(interaction: ButtonInteraction, action: string) {
  const guild = interaction.guild;
  if (!guild || !(action in ACTIONS)) return;
  const { droit, executer } = ACTIONS[action as keyof typeof ACTIONS];
  if (!(await droit(guild, interaction.user.id))) {
    await interaction.reply({ content: "Action réservée aux MJ actifs et aux Admins.", flags: MessageFlags.Ephemeral });
    return;
  }
  await executer(interaction, guild);
}
