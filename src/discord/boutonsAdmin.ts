import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
} from "discord.js";
import { FAMILLE_JOUEUR } from "./admin/joueur";
import { FAMILLE_MODERATION } from "./admin/moderation";
import type { FamilleAdmin } from "./admin/outils";
import { FAMILLE_POLITIQUE } from "./admin/politique";
import { FAMILLE_RESSOURCES } from "./admin/ressources";
import { FAMILLE_SERVEUR } from "./admin/serveur";
import { FAMILLE_TEMPS } from "./admin/temps";
import { FAMILLE_VILLE } from "./admin/ville";
import { estAdmin } from "./permissions";

// Panneau /admin (Components V2) : l'accueil propose une famille d'actions par bouton, chaque famille
// ouvre son sous-panneau (conception.md §4). customId : "admin:menu:<famille|accueil>" pour la navigation,
// "admin:<famille>:<action>" pour une action (actions decrites dans discord/admin/). Routes par boutons.ts.
// Les droits sont reverifies a chaque clic, le panneau pouvant rester affiche longtemps.

const COULEUR_ADMIN = 0xe67e22; // orange du role Admin
const BOUTONS_PAR_LIGNE = 5;

const FAMILLES: readonly FamilleAdmin[] = [
  FAMILLE_SERVEUR,
  FAMILLE_VILLE,
  FAMILLE_JOUEUR,
  FAMILLE_RESSOURCES,
  FAMILLE_TEMPS,
  FAMILLE_POLITIQUE,
  FAMILLE_MODERATION,
];

function lignesDeBoutons(boutons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
  const lignes: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < boutons.length; i += BOUTONS_PAR_LIGNE) {
    lignes.push(new ActionRowBuilder<ButtonBuilder>().addComponents(boutons.slice(i, i + BOUTONS_PAR_LIGNE)));
  }
  return lignes;
}

export function construirePanneauAdmin(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COULEUR_ADMIN)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🛠️ Administration\nChoisissez une famille d'actions :\n" +
          FAMILLES.map((f) => `${f.emoji} **${f.titre}** : ${f.resume}`).join("\n"),
      ),
    )
    .addActionRowComponents(
      lignesDeBoutons(
        FAMILLES.map((f) =>
          new ButtonBuilder().setCustomId(`admin:menu:${f.cle}`).setLabel(f.titre).setEmoji(f.emoji).setStyle(ButtonStyle.Secondary),
        ),
      ),
    );
}

function construireSousPanneau(famille: FamilleAdmin): ContainerBuilder {
  const descriptions = famille.actions.map(
    (a) => `**${a.libelle}**${a.executer ? "" : " *(à venir)*"} : ${a.description}`,
  );
  const boutons = famille.actions.map((a) =>
    new ButtonBuilder()
      .setCustomId(`admin:${famille.cle}:${a.cle}`)
      .setLabel(a.libelle)
      .setStyle(a.style ?? ButtonStyle.Secondary)
      .setDisabled(!a.executer),
  );

  return new ContainerBuilder()
    .setAccentColor(COULEUR_ADMIN)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${famille.emoji} Administration — ${famille.titre}\n${descriptions.join("\n")}`),
    )
    .addActionRowComponents(lignesDeBoutons(boutons))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("admin:menu:accueil").setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
      ),
    );
}

export async function gererBoutonAdmin(interaction: ButtonInteraction, cleFamille: string, cleAction: string | undefined) {
  const guild = interaction.guild;
  if (!guild || !cleAction) return;
  if (!(await estAdmin(guild, interaction.user.id))) {
    await interaction.reply({ content: "Action réservée aux Admins.", flags: MessageFlags.Ephemeral });
    return;
  }

  // Navigation : le panneau est remplace sur place par l'accueil ou le sous-panneau d'une famille
  if (cleFamille === "menu") {
    const famille = FAMILLES.find((f) => f.cle === cleAction);
    await interaction.update({ components: [famille ? construireSousPanneau(famille) : construirePanneauAdmin()] });
    return;
  }

  const action = FAMILLES.find((f) => f.cle === cleFamille)?.actions.find((a) => a.cle === cleAction);
  await action?.executer?.(interaction, guild);
}
