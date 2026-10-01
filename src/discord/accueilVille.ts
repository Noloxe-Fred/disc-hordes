import { AttachmentBuilder, type Guild, type TextChannel } from "discord.js";
import { LONGUEUR_MAX_DESCRIPTION_IMAGE, salonsLiables, texteBrut } from "./publicationRegles";
import { trouverSalonTexte } from "./reconcile";
import { lireSectionAccueilVille } from "./reglesJoueurs";
import { rendreSection } from "./renduRegles";

// Message d'accueil a la fondation d'une ville (conception.md, Onboarding) : poste dans la mairie juste apres l'annonce
// de fondation, et epingle. Tous les habitants sont mentionnes (l'annonce de fondation donne deja le PA max), puis le texte de
// docs/accueil-ville.md est affiche en image, dans le style des regles ; les salons cites sont rappeles en liens.

// Salons de la ville citables dans le texte (#nom), par nom : suffixe de leur cle (villeStructure.ts)
const SALONS_VILLE = [
  { nom: "place-publique", suffixe: "place-publique" },
  { nom: "chantiers", suffixe: "chantiers" },
  { nom: "maisons-privées", suffixe: "maisons-privees" },
];

// Image rendue une fois par demarrage du bot : le texte ne change pas d'une ville a l'autre
let image: Promise<{ section: string; png: Buffer } | null> | null = null;

function imageAccueil() {
  image ??= (async () => {
    const section = lireSectionAccueilVille();
    return section ? { section, png: await rendreSection(section) } : null;
  })().catch((error) => {
    image = null; // nouvel essai a la prochaine fondation
    throw error;
  });
  return image;
}

export async function posterAccueilVille(
  guild: Guild,
  villeId: number,
  salonMairie: TextChannel,
  habitantsDiscordIds: string[],
): Promise<void> {
  const accueil = await imageAccueil();

  const salons = await salonsLiables(guild);
  for (const { nom, suffixe } of SALONS_VILLE) {
    const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:${suffixe}`);
    if (salon) salons.set(nom, salon.id);
  }
  const cites = accueil ? [...salons].filter(([nom]) => accueil.section.includes(`#${nom}`)).map(([, id]) => `<#${id}>`) : [];

  const mentions = habitantsDiscordIds.map((id) => `<@${id}>`).join(" ");
  const message = await salonMairie.send({
    content:
      `🏙️ Bienvenue en ville, ${mentions} !` +
      (cites.length > 0 ? `\n🔗 ${cites.join(" · ")}` : ""),
    files: accueil
      ? [
          new AttachmentBuilder(accueil.png, {
            name: "accueil-ville.png",
            description: texteBrut(accueil.section).slice(0, LONGUEUR_MAX_DESCRIPTION_IMAGE),
          }),
        ]
      : [],
    allowedMentions: { users: habitantsDiscordIds },
  });
  await message.pin().catch(() => null);
}
