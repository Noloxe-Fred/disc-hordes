import { EmbedBuilder, type Guild } from "discord.js";
import { trouverSalonTexte } from "./reconcile";
import { construireSommaire, lierSalons, lireMessagesRegles } from "./reglesJoueurs";
import {
  SALON_ANNONCES,
  SALON_COMMEMORATION,
  SALON_FONDER_COLONIE,
  SALON_GENERAL,
  SALON_NOUVEL_ARRIVANT,
  SALON_REGLES,
} from "./structure";

const COULEUR_SOMMAIRE = 0x2ecc71;

const SALONS_LIABLES = [
  SALON_GENERAL,
  SALON_ANNONCES,
  SALON_REGLES,
  SALON_FONDER_COLONIE,
  SALON_NOUVEL_ARRIVANT,
  SALON_COMMEMORATION,
];

// Republie les regles joueurs (docs/regles-joueurs.md) dans #regles (bouton « Publier les règles » du panneau
// /moderation) : supprime les anciens messages du bot dans ce salon puis poste le contenu a jour.
// Renvoie le compte rendu a afficher.
export async function publierRegles(guild: Guild): Promise<string> {
  const salonRegles = await trouverSalonTexte(guild, SALON_REGLES.cle);
  if (!salonRegles) return "Salon règles introuvable : un Admin doit d'abord initialiser le serveur (panneau `/admin`).";

  let messages: string[];
  try {
    messages = lireMessagesRegles();
  } catch (error) {
    return `Règles non publiées : ${(error as Error).message}`;
  }

  // Anciens messages du bot uniquement : un message ecrit a la main par un MJ/Admin est conserve
  const anciens = await salonRegles.messages.fetch({ limit: 100 });
  const aSupprimer = anciens.filter((m) => m.author.id === guild.client.user.id);
  for (const message of aSupprimer.values()) {
    await message.delete().catch(() => null);
  }

  const salons = new Map<string, string>();
  for (const { cle, nom } of SALONS_LIABLES) {
    const salon = await trouverSalonTexte(guild, cle);
    if (salon) salons.set(nom, salon.id);
  }

  // Sommaire poste en premier (sans liens), puis complete une fois les messages publies et leurs liens connus
  const embedSommaire = (liens: (string | null)[]) =>
    new EmbedBuilder()
      .setTitle("📖 Sommaire")
      .setColor(COULEUR_SOMMAIRE)
      .setDescription(construireSommaire(messages, liens))
      .setFooter({ text: "Cliquez sur un titre pour aller à la section." });
  const sommaire = await salonRegles.send({ embeds: [embedSommaire(messages.map(() => null))] });
  const liens: string[] = [];
  for (const message of messages) {
    const publie = await salonRegles.send({ content: lierSalons(message, salons), allowedMentions: { parse: [] } });
    liens.push(publie.url);
  }
  await sommaire.edit({ embeds: [embedSommaire(liens)] });

  return (
    `Règles mises à jour dans ${salonRegles} : ${aSupprimer.size} ancien(s) message(s) supprimé(s), ` +
    `sommaire + ${messages.length} message(s) publié(s).`
  );
}
