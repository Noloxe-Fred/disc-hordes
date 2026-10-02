import { AttachmentBuilder, type Guild } from "discord.js";
import { LONGUEUR_MAX_DESCRIPTION_IMAGE, texteBrut } from "./publicationRegles";
import { rendreSection } from "./renduRegles";
import { posterDansMairie } from "./villeStructure";

// Annonces de changement de phase dans la mairie (tombee de la nuit, aube et attaque) : le detail est rendu en image dans le
// style des regles (renduRegles.ts), le texte du message garde la mention de la ville, un resume et les joueurs cites
// (pour qu'ils soient prevenus). Si le rendu echoue, l'annonce part en texte comme avant.

export interface AnnonceCycle {
  titre: string;
  resume: string;
  sections: { titre?: string; lignes: string[] }[];
}

const MENTION = /<@!?(\d+)>/g;

// Une image ne peut pas afficher une mention : chaque <@id> devient le nom du membre, en gras
async function remplacerMentions(guild: Guild, texte: string): Promise<{ texte: string; ids: string[] }> {
  const ids = [...new Set([...texte.matchAll(MENTION)].map((m) => m[1]))];
  const noms = new Map<string, string>();
  if (ids.length > 0) {
    const membres = await guild.members.fetch({ user: ids }).catch(() => null);
    for (const id of ids) noms.set(id, membres?.get(id)?.displayName ?? "un survivant");
  }
  return {
    texte: texte.replace(MENTION, (_, id: string) => `**${noms.get(id)!.replace(/[*`]/g, "")}**`),
    ids,
  };
}

function markdown(annonce: AnnonceCycle): string {
  const corps = annonce.sections
    .filter((s) => s.lignes.length > 0)
    .map((s) => (s.titre ? `## ${s.titre}\n` : "") + s.lignes.join("\n"))
    .join("\n\n");
  return `# ${annonce.titre}\n${corps}`;
}

export async function posterAnnonceCycle(guild: Guild, villeId: number, annonce: AnnonceCycle): Promise<void> {
  const section = markdown(annonce);
  const { texte, ids } = await remplacerMentions(guild, section);
  const cites = ids.length > 0 ? `\n${ids.map((id) => `<@${id}>`).join(" ")}` : "";

  let png: Buffer;
  try {
    png = await rendreSection(texte);
  } catch (error) {
    console.error("Rendu de l'annonce de phase impossible, envoi en texte", error);
    const lignes = annonce.sections.flatMap((s) => s.lignes);
    await posterDansMairie(guild, villeId, [annonce.resume, ...lignes].join("\n"), { mentionnerVille: true });
    return;
  }

  await posterDansMairie(guild, villeId, annonce.resume + cites, {
    mentionnerVille: true,
    fichiers: [
      new AttachmentBuilder(png, {
        name: "annonce.png",
        description: texteBrut(texte).slice(0, LONGUEUR_MAX_DESCRIPTION_IMAGE),
      }),
    ],
  });
}
