import { AttachmentBuilder, type GuildMember } from "discord.js";
import { LONGUEUR_MAX_DESCRIPTION_IMAGE, salonsLiables, texteBrut } from "./publicationRegles";
import { trouverSalonTexte } from "./reconcile";
import { lireSectionBienvenue } from "./reglesJoueurs";
import { rendreSection } from "./renduRegles";
import { SALON_NOUVEL_HABITANT } from "./structure";

// Message de bienvenue du serveur (conception.md, Onboarding) : poste dans #nouvel-habitant a l'arrivee d'un membre,
// avant meme qu'il rejoigne une ville. Le membre est mentionne, puis le texte de docs/bienvenue.md est affiche en image,
// dans le style des regles ; les salons cites sont rappeles en liens cliquables.

// Image rendue une fois par demarrage du bot : le texte ne change pas d'un arrivant a l'autre
let image: Promise<{ section: string; png: Buffer } | null> | null = null;

function imageBienvenue() {
  image ??= (async () => {
    const section = lireSectionBienvenue();
    return section ? { section, png: await rendreSection(section) } : null;
  })().catch((error) => {
    image = null; // nouvel essai au prochain arrivant
    throw error;
  });
  return image;
}

export async function posterBienvenue(membre: GuildMember): Promise<void> {
  if (membre.user.bot) return;
  const guild = membre.guild;
  const salon = await trouverSalonTexte(guild, SALON_NOUVEL_HABITANT.cle);
  if (!salon) return;

  const bienvenue = await imageBienvenue();
  const salons = await salonsLiables(guild);
  const cites = bienvenue ? [...salons].filter(([nom]) => bienvenue.section.includes(`#${nom}`)).map(([, id]) => `<#${id}>`) : [];

  await salon.send({
    content: `🧟 Bienvenue, <@${membre.id}> !` + (cites.length > 0 ? `\n🔗 ${cites.join(" · ")}` : ""),
    files: bienvenue
      ? [
          new AttachmentBuilder(bienvenue.png, {
            name: "bienvenue.png",
            description: texteBrut(bienvenue.section).slice(0, LONGUEUR_MAX_DESCRIPTION_IMAGE),
          }),
        ]
      : [],
    // Seul le nouvel arrivant est notifie
    allowedMentions: { users: [membre.id] },
  });
}
