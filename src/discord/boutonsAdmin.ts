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
import { estAdmin, estMjActif, estMjOuAdmin } from "./permissions";

// Panneaux /admin et /mj (Components V2) : l'accueil propose une famille d'actions par bouton, chaque famille ouvre
// son sous-panneau (conception.md §4). Le panneau /mj reprend les memes familles, limitees aux actions ouvertes aux MJ
// (ACTIONS_MJ), et ajoute les outils propres aux MJ (discord/boutonsMj.ts). customId : "<mode>:menu:<famille|accueil>"
// pour la navigation, "<mode>:<famille>:<action>" pour une action (actions decrites dans discord/admin/), avec
// mode = admin ou mj. Routes par boutons.ts. Les droits sont reverifies a chaque clic, le panneau pouvant rester
// affiche longtemps.

export type ModePanneau = "admin" | "mj";

const COULEUR: Record<ModePanneau, number> = { admin: 0xe67e22, mj: 0xf1c40f }; // orange Admin, or MJ
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

// Actions du panneau /admin ouvertes aux MJ actifs, par famille ; les autres restent reservees aux Admins
const ACTIONS_MJ: Record<string, readonly string[]> = {
  ville: ["renommer", "fonder", "recharger", "construire"],
  joueur: ["teleporter", "ressusciter", "guerir", "exclure", "reintegrer", "metier", "jauges"],
  ressources: ["ajout-joueur", "retrait-joueur", "ajout-ville", "retrait-ville"],
  politique: ["election", "destituer", "maire"],
  moderation: ["mute", "kick", "journal"],
};

function famillesDuMode(mode: ModePanneau): FamilleAdmin[] {
  if (mode === "admin") return [...FAMILLES];
  return FAMILLES.map((f) => ({ ...f, actions: f.actions.filter((a) => ACTIONS_MJ[f.cle]?.includes(a.cle)) })).filter(
    (f) => f.actions.length > 0,
  );
}

function lignesDeBoutons(boutons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
  const lignes: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < boutons.length; i += BOUTONS_PAR_LIGNE) {
    lignes.push(new ActionRowBuilder<ButtonBuilder>().addComponents(boutons.slice(i, i + BOUTONS_PAR_LIGNE)));
  }
  return lignes;
}

function boutonsFamilles(mode: ModePanneau): ButtonBuilder[] {
  return famillesDuMode(mode).map((f) =>
    new ButtonBuilder().setCustomId(`${mode}:menu:${f.cle}`).setLabel(f.titre).setEmoji(f.emoji).setStyle(ButtonStyle.Secondary),
  );
}

function resumeFamilles(mode: ModePanneau): string {
  return famillesDuMode(mode)
    .map((f) => `${f.emoji} **${f.titre}** : ${mode === "admin" ? f.resume : f.actions.map((a) => a.libelle.toLowerCase()).join(", ")}`)
    .join("\n");
}

export function construirePanneauAdmin(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COULEUR.admin)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🛠️ Administration\nChoisissez une famille d'actions :\n${resumeFamilles("admin")}`),
    )
    .addActionRowComponents(lignesDeBoutons(boutonsFamilles("admin")));
}

// Panneau /mj : outils propres aux MJ (regles, bascule MJ inactif), puis familles d'actions ouvertes aux MJ
export function construirePanneauMj(options: { mjActif: boolean }): ContainerBuilder {
  const outils = [
    new ButtonBuilder().setCustomId("mj:outils:regles").setLabel("Publier les règles").setEmoji("📜").setStyle(ButtonStyle.Primary),
    ...(options.mjActif
      ? [new ButtonBuilder().setCustomId("mj:outils:inactif").setLabel("Passer en MJ inactif").setEmoji("🎮").setStyle(ButtonStyle.Secondary)]
      : []),
  ];
  return new ContainerBuilder()
    .setAccentColor(COULEUR.mj)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🛡️ Panneau MJ\n" +
          "**Publier les règles** : republie les règles joueurs à jour dans le salon règles (les anciens messages du bot y sont supprimés)." +
          (options.mjActif
            ? "\n**Passer en MJ inactif** : vous voyez le serveur comme un joueur (plus discussion-mj) et pouvez jouer ; " +
              "`/mj` vous permettra de redevenir MJ actif."
            : ""),
      ),
    )
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...outils))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Actions de jeu :\n${resumeFamilles("mj")}`))
    .addActionRowComponents(lignesDeBoutons(boutonsFamilles("mj")));
}

export function construirePanneauMjInactif(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COULEUR.mj)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "## 🎮 MJ inactif\nVous voyez le serveur comme un joueur. **Redevenir MJ actif** vous rend la vue sur tout le jeu " +
          "et les outils MJ, mais vous ne pourrez plus jouer tant que vous serez actif.",
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("mj:outils:actif").setLabel("Redevenir MJ actif").setEmoji("🛡️").setStyle(ButtonStyle.Primary),
      ),
    );
}

function construireSousPanneau(famille: FamilleAdmin, mode: ModePanneau): ContainerBuilder {
  const descriptions = famille.actions.map(
    (a) => `**${a.libelle}**${a.executer ? "" : " *(à venir)*"} : ${a.description}`,
  );
  const boutons = famille.actions.map((a) =>
    new ButtonBuilder()
      .setCustomId(`${mode}:${famille.cle}:${a.cle}`)
      .setLabel(a.libelle)
      .setStyle(a.style ?? ButtonStyle.Secondary)
      .setDisabled(!a.executer),
  );

  return new ContainerBuilder()
    .setAccentColor(COULEUR[mode])
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${famille.emoji} ${mode === "admin" ? "Administration" : "MJ"} — ${famille.titre}\n${descriptions.join("\n")}`,
      ),
    )
    .addActionRowComponents(lignesDeBoutons(boutons))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${mode}:menu:accueil`).setLabel("Retour").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
      ),
    );
}

// Bouton d'un panneau /admin ou /mj : Admin pour le premier, MJ actif ou Admin pour le second, et seules les actions
// du mode sont executables
export async function gererBoutonPanneau(
  interaction: ButtonInteraction,
  mode: ModePanneau,
  cleFamille: string,
  cleAction: string | undefined,
) {
  const guild = interaction.guild;
  if (!guild || !cleAction) return;
  const autorise = mode === "admin" ? await estAdmin(guild, interaction.user.id) : await estMjOuAdmin(guild, interaction.user.id);
  if (!autorise) {
    await interaction.reply({
      content: mode === "admin" ? "Action réservée aux Admins." : "Action réservée aux MJ actifs et aux Admins.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Navigation : le panneau est remplace sur place par l'accueil ou le sous-panneau d'une famille
  if (cleFamille === "menu") {
    const famille = famillesDuMode(mode).find((f) => f.cle === cleAction);
    const accueil =
      mode === "admin" ? construirePanneauAdmin() : construirePanneauMj({ mjActif: await estMjActif(guild, interaction.user.id) });
    await interaction.update({ components: [famille ? construireSousPanneau(famille, mode) : accueil] });
    return;
  }

  const action = famillesDuMode(mode)
    .find((f) => f.cle === cleFamille)
    ?.actions.find((a) => a.cle === cleAction);
  await action?.executer?.(interaction, guild);
}
