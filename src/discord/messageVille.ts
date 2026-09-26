import type { Prisma } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type Guild,
} from "discord.js";
import { JOUEURS_MAX_PAR_VILLE, NOM_METIER } from "../config/metiers";
import { prisma } from "../db";
import { trouverSalonTexte } from "./reconcile";
import { SALON_FONDER_COLONIE, SALON_NOUVEL_ARRIVANT } from "./structure";
import { enCitation } from "./texteLibre";

// Message de recrutement d'une ville en creation (Components V2), poste dans #fonder-une-colonie :
// projet du createur, liste des inscrits et boutons Rejoindre / Quitter / Fonder / Annuler
// (traites dans boutonsVille.ts). Son id est stocke dans Ville.messageAnnonceId.

export const INCLUDE_MESSAGE_VILLE = {
  createur: true,
  habitants: { include: { utilisateur: true }, orderBy: { id: "asc" } },
} satisfies Prisma.VilleInclude;

type VilleMessage = Prisma.VilleGetPayload<{ include: typeof INCLUDE_MESSAGE_VILLE }>;

const COULEUR_MESSAGE_VILLE = 0x2ecc71;

export function construireMessageVille(ville: VilleMessage) {
  const inscrits = ville.habitants
    .map((h) => `- <@${h.utilisateur.discordId}> — ${h.metier ? NOM_METIER[h.metier] : "sans métier"}`)
    .join("\n");

  const conteneur = new ContainerBuilder()
    .setAccentColor(COULEUR_MESSAGE_VILLE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${ville.nom}\nVille en cours de création par <@${ville.createur.discordId}>`,
      ),
    );

  if (ville.projet) {
    conteneur.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Projet de ville**\n${enCitation(ville.projet)}`),
    );
  }

  conteneur
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Inscrits (${ville.habitants.length}/${JOUEURS_MAX_PAR_VILLE})**\n${inscrits}`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ville:rejoindre:${ville.id}`).setLabel("Rejoindre la ville").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ville:quitter:${ville.id}`).setLabel("Quitter la ville").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ville:fonder:${ville.id}`).setLabel("Fonder la ville").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ville:annuler:${ville.id}`).setLabel("Annuler la ville").setStyle(ButtonStyle.Danger),
      ),
    );

  return {
    components: [conteneur],
    flags: MessageFlags.IsComponentsV2 as const,
    // Affiche les mentions sans notifier personne (le message est edite a chaque inscription)
    allowedMentions: { parse: [] },
  };
}

// Met a jour la liste des inscrits apres une inscription ou un depart
export async function rafraichirMessageVille(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.findUnique({ where: { id: villeId }, include: INCLUDE_MESSAGE_VILLE });
  if (!ville?.messageAnnonceId) return;
  const salon = await trouverSalonTexte(guild, SALON_FONDER_COLONIE.cle);
  const message = await salon?.messages.fetch(ville.messageAnnonceId).catch(() => null);
  const { components, allowedMentions } = construireMessageVille(ville);
  await message?.edit({ components, allowedMentions }).catch(() => null);
}

async function supprimerMessages(guild: Guild, cleSalon: string, ids: string[]) {
  if (ids.length === 0) return;
  const salon = await trouverSalonTexte(guild, cleSalon);
  if (!salon) return;
  for (const id of ids) {
    const message = await salon.messages.fetch(id).catch(() => null);
    await message?.delete().catch(() => null);
  }
}

// A la fondation ou a l'annulation : message de la ville dans #fonder-une-colonie et messages
// des demandes d'inscription dans #nouvel-arrivant (conception.md §4 : "supprimes/archives")
export async function supprimerMessagesRecrutement(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.findUnique({ where: { id: villeId }, select: { messageAnnonceId: true } });
  if (ville?.messageAnnonceId) await supprimerMessages(guild, SALON_FONDER_COLONIE.cle, [ville.messageAnnonceId]);

  const demandes = await prisma.demandeInscription.findMany({
    where: { villeId, messageId: { not: null } },
    select: { messageId: true },
  });
  await supprimerMessages(
    guild,
    SALON_NOUVEL_ARRIVANT.cle,
    demandes.flatMap(({ messageId }) => (messageId ? [messageId] : [])),
  );
}
