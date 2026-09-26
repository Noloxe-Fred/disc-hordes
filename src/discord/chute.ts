import { StatutJoueur, StatutVille } from "@prisma/client";
import { ContainerBuilder, MessageFlags, SeparatorBuilder, TextDisplayBuilder, type Guild } from "discord.js";
import { NOM_METIER } from "../config/metiers";
import { LIBELLE_CAUSE_MORT } from "../config/mort";
import { prisma } from "../db";
import { supprimerRessources, trouverSalonTexte } from "./reconcile";
import { SALON_COMMEMORATION } from "./structure";

// Chute d'une ville (conception.md §1, Multi-villes), declenchee par la mort de son dernier habitant
// (game/mort.ts). Le recapitulatif est poste dans #commemoration. Les salons et roles d'une ville
// tombee restent en place tant que d'autres villes de son groupe sont en jeu ; quand toutes les villes
// du groupe sont tombees, tout ce qui appartient au groupe est supprime : roles-ville, categories
// Ville et leurs salons, categorie Territoires externes, salons de zone et roles Position.
export async function declarerChuteVille(guild: Guild, villeId: number): Promise<void> {
  const ville = await prisma.ville.update({
    where: { id: villeId },
    data: { statut: StatutVille.TOMBEE, dateChute: new Date() },
  });

  await posterRecapitulatif(guild, villeId).catch((error) =>
    console.error(`Recapitulatif de chute de la ville ${villeId} impossible`, error),
  );

  if (ville.groupeId !== null) await nettoyerGroupeSiTombe(guild, ville.groupeId);
}

const COULEUR_COMMEMORATION = 0x2c3e50;

function formaterDate(date: Date | null): string {
  return date ? `<t:${Math.floor(date.getTime() / 1000)}:D>` : "?";
}

function formaterDuree(debut: Date | null, fin: Date | null): string {
  if (!debut || !fin) return "?";
  const jours = Math.floor((fin.getTime() - debut.getTime()) / 86_400_000);
  return jours <= 1 ? `${jours} jour` : `${jours} jours`;
}

async function posterRecapitulatif(guild: Guild, villeId: number): Promise<void> {
  const salon = await trouverSalonTexte(guild, SALON_COMMEMORATION.cle);
  if (!salon) return;

  const ville = await prisma.ville.findUniqueOrThrow({
    where: { id: villeId },
    include: {
      createur: true,
      maire: { include: { utilisateur: true } },
      habitants: { include: { utilisateur: true }, orderBy: { dateMort: "asc" } },
      attaques: { orderBy: { forceAttaque: "desc" }, take: 1 },
    },
  });

  // Le dernier mort est le dernier survivant de la ville
  const morts = ville.habitants.filter((h) => h.dateMort !== null);
  const dernierSurvivant = morts.at(-1);

  const habitants = ville.habitants
    .map((h) => {
      const metier = h.metier ? NOM_METIER[h.metier] : "sans métier";
      const sort =
        h.causeMort !== null
          ? `${LIBELLE_CAUSE_MORT[h.causeMort]}${h.dateMort ? ` le ${formaterDate(h.dateMort)}` : ""}`
          : h.statut === StatutJoueur.EXCLU
            ? "exclu de la ville"
            : "a quitté la ville";
      return `- <@${h.utilisateur.discordId}> (${metier}) — ${sort}`;
    })
    .join("\n");

  const pireAttaque = ville.attaques[0];

  const conteneur = new ContainerBuilder()
    .setAccentColor(COULEUR_COMMEMORATION)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🕯️ ${ville.nom} est tombée\n` +
          `Fondée par <@${ville.createur.discordId}> le ${formaterDate(ville.dateFondation)}, ` +
          `tombée le ${formaterDate(ville.dateChute)} après ${formaterDuree(ville.dateFondation, ville.dateChute)}.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Nuits survécues :** ${Math.max(0, ville.cycleActuel - 1)}`,
          `**Habitants :** ${ville.habitants.length} (PA max individuel fixé à la fondation : ${ville.paMaxFondation ?? "?"})`,
          ville.maire ? `**Dernier maire :** <@${ville.maire.utilisateur.discordId}>` : null,
          pireAttaque
            ? `**Plus forte attaque subie :** ${pireAttaque.forceAttaque.toFixed(1)} (cycle ${pireAttaque.cycleNumero}, défense ${pireAttaque.defenseTotale})`
            : null,
          dernierSurvivant ? `**Dernier survivant :** <@${dernierSurvivant.utilisateur.discordId}>` : null,
        ]
          .filter((ligne) => ligne !== null)
          .join("\n"),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Habitants**\n${habitants}`));

  await salon.send({
    components: [conteneur],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }, // hommage sans notification
  });
}

export async function nettoyerGroupeSiTombe(guild: Guild, groupeId: number): Promise<boolean> {
  const villesEnJeu = await prisma.ville.count({ where: { groupeId, statut: { not: StatutVille.TOMBEE } } });
  if (villesEnJeu > 0) return false;

  const [villes, zones] = await Promise.all([
    prisma.ville.findMany({ where: { groupeId }, select: { id: true } }),
    prisma.zone.findMany({ where: { groupeId }, select: { id: true } }),
  ]);

  await supprimerRessources(
    guild,
    [
      `categorie:groupe:${groupeId}:territoires`,
      ...villes.flatMap(({ id }) => [`role:ville:${id}`, `categorie:ville:${id}`]),
      ...zones.flatMap(({ id }) => [`salon:zone:${id}`, `role:position:zone:${id}`]),
    ],
    villes.map(({ id }) => `salon:ville:${id}:`),
  );
  return true;
}
