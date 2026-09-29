import { AttachmentBuilder, EmbedBuilder, ThreadAutoArchiveDuration, type Guild, type TextChannel } from "discord.js";
import { trouverSalonTexte } from "./reconcile";
import { construireSommaire, lierSalons, lireSectionsRegles } from "./reglesJoueurs";
import { rendreSection } from "./renduRegles";
import {
  SALON_ANNONCES,
  SALON_COMMEMORATION,
  SALON_FONDER_COLONIE,
  SALON_GENERAL,
  SALON_NOUVEL_ARRIVANT,
  SALON_REGLES,
} from "./structure";

const COULEUR_SOMMAIRE = 0xddab76; // bordure beige de la charte MyHordes, comme les images
const LONGUEUR_MAX_MESSAGE = 2000;
const LONGUEUR_MAX_DESCRIPTION_IMAGE = 1024;

const SALONS_LIABLES = [
  SALON_GENERAL,
  SALON_ANNONCES,
  SALON_REGLES,
  SALON_FONDER_COLONIE,
  SALON_NOUVEL_ARRIVANT,
  SALON_COMMEMORATION,
];

// Texte brut d'une section, pour la description (texte alternatif) de son image
function texteBrut(section: string): string {
  return section
    .replace(/^#+\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/[*`]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Decoupe un texte en messages de 2000 caracteres max, aux fins de ligne
function decouper(texte: string): string[] {
  const morceaux: string[] = [];
  let courant = "";
  for (const ligne of texte.split("\n")) {
    const candidat = courant ? `${courant}\n${ligne}` : ligne;
    if (candidat.length > LONGUEUR_MAX_MESSAGE && courant) {
      morceaux.push(courant);
      courant = ligne.slice(0, LONGUEUR_MAX_MESSAGE);
    } else {
      courant = candidat.slice(0, LONGUEUR_MAX_MESSAGE);
    }
  }
  if (courant.trim()) morceaux.push(courant);
  return morceaux;
}

// Supprime les messages et les fils publies par le bot : un message ecrit a la main par un MJ/Admin est conserve.
// Supprimer le message de depart d'un fil ne supprime pas le fil, d'ou le nettoyage des fils a part.
async function nettoyer(salon: TextChannel, botId: string): Promise<number> {
  const [actifs, archives] = await Promise.all([
    salon.threads.fetchActive().catch(() => null),
    salon.threads.fetchArchived({ type: "public" }).catch(() => null),
  ]);
  for (const fil of [...(actifs?.threads.values() ?? []), ...(archives?.threads.values() ?? [])]) {
    if (fil.ownerId === botId && fil.parentId === salon.id) await fil.delete().catch(() => null);
  }

  const anciens = await salon.messages.fetch({ limit: 100 });
  const aSupprimer = anciens.filter((m) => m.author.id === botId);
  for (const message of aSupprimer.values()) {
    await message.delete().catch(() => null);
  }
  return aSupprimer.size;
}

// Republie les regles joueurs (docs/regles-joueurs.md) dans #regles (bouton « Publier les règles » du panneau
// /mj) : un sommaire en embed, puis une image par section (titre "# ") avec sous l'image les liens vers
// les salons cites ; un fil verrouille sous le sommaire contient le texte de toutes les sections (recherche et copie).
// Renvoie le compte rendu a afficher.
export async function publierRegles(guild: Guild): Promise<string> {
  const salonRegles = await trouverSalonTexte(guild, SALON_REGLES.cle);
  if (!salonRegles) return "Salon règles introuvable : un Admin doit d'abord initialiser le serveur (panneau `/admin`).";

  const sections = lireSectionsRegles();
  if (sections.length === 0) return "Règles non publiées : aucune section (titre « # ») dans docs/regles-joueurs.md.";

  // Images rendues avant de toucher au salon : en cas d'erreur, les anciennes regles restent en place
  let images: Buffer[];
  try {
    images = await Promise.all(sections.map((section) => rendreSection(section)));
  } catch (error) {
    return `Règles non publiées : rendu des images impossible (${(error as Error).message}).`;
  }

  const botId = guild.client.user.id;
  const supprimes = await nettoyer(salonRegles, botId);

  const salons = new Map<string, string>();
  for (const { cle, nom } of SALONS_LIABLES) {
    const salon = await trouverSalonTexte(guild, cle);
    if (salon) salons.set(nom, salon.id);
  }

  // Sommaire poste en premier (sans liens), puis complete une fois les sections publiees et leurs liens connus
  const embedSommaire = (liens: (string | null)[]) =>
    new EmbedBuilder()
      .setTitle("📖 Sommaire")
      .setColor(COULEUR_SOMMAIRE)
      .setDescription(construireSommaire(sections, liens))
      .setFooter({ text: "Cliquez sur un titre pour aller à la section. Le texte complet des règles est dans le fil de ce message." });
  const sommaire = await salonRegles.send({ embeds: [embedSommaire(sections.map(() => null))] });

  const liens: string[] = [];
  for (const [index, section] of sections.entries()) {
    // Les salons cites ne sont pas cliquables dans l'image : liens rappeles sous celle-ci
    const cites = [...salons].filter(([nom]) => section.includes(`#${nom}`)).map(([, id]) => `<#${id}>`);
    const publie = await salonRegles.send({
      content: cites.length > 0 ? `🔗 ${cites.join(" · ")}` : undefined,
      files: [
        new AttachmentBuilder(images[index], {
          name: `regles-${index + 1}.png`,
          description: texteBrut(section).slice(0, LONGUEUR_MAX_DESCRIPTION_IMAGE),
        }),
      ],
      allowedMentions: { parse: [] },
    });
    liens.push(publie.url);
  }
  await sommaire.edit({ embeds: [embedSommaire(liens)] });

  // Un seul fil, sous le sommaire, avec le texte de toutes les sections (recherche et copie) : chaque section
  // commence un nouveau message
  const fil = await sommaire.startThread({
    name: "📄 Règles complètes (texte)",
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
  });
  for (const section of sections) {
    for (const morceau of decouper(lierSalons(section, salons))) {
      await fil.send({ content: morceau, allowedMentions: { parse: [] } });
    }
  }
  // Verrouille : seuls les MJ/Admin (gestion des fils) peuvent y ecrire
  const verrouille = await fil.setLocked(true).then(() => true).catch(() => false);

  return (
    `Règles mises à jour dans ${salonRegles} : ${supprimes} ancien(s) message(s) supprimé(s), ` +
    `sommaire + ${sections.length} section(s) publiée(s) en image, texte complet dans le fil du sommaire.` +
    (verrouille ? "" : `\n⚠️ Fil non verrouillé : le bot n'a pas la permission « Gérer les fils » dans ${salonRegles}.`)
  );
}
