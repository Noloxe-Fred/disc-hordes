import { StatutJoueur, StatutVille } from "@prisma/client";
import { ContainerBuilder, MessageFlags, SeparatorBuilder, TextDisplayBuilder, type Guild } from "discord.js";
import { NOM_METIER } from "../config/metiers";
import { LIBELLE_CAUSE_MORT } from "../config/mort";
import { prisma } from "../db";
import { retirerJoueurDeVilleDiscord } from "./joueurDiscord";
import { supprimerRessources, trouverSalonTexte } from "./reconcile";
import { SALON_COMMEMORATION } from "./structure";
import { verrouille } from "../services/verrou";

// Chute d'une ville (conception.md §1, Multi-villes), declenchee par la mort ou le depart de son dernier habitant
// vivant. Le recapitulatif est poste dans #commemoration, puis tous les joueurs quittent la ville (retour au role
// Nomade) et l'etat de jeu de la ville est efface de la base : seul reste un historique leger (la ville, ses dates et
// cycles tenus, ses habitants avec metier et cause de mort) pour le futur classement (conception.md §8). Les salons
// et roles d'une ville tombee restent en place tant que d'autres villes de son groupe sont en jeu ; quand toutes les
// villes du groupe sont tombees, tout ce qui appartient au groupe est supprime : roles-ville, categories Ville et
// leurs salons, categorie Territoires externes, salons de zone et roles Position, puis en base le groupe et ses zones.
export const declarerChuteVille = verrouille(async function declarerChuteVille(guild: Guild, villeId: number): Promise<void> {
  // Une seule chute par ville : deux morts simultanees (ou une chute forcee depuis /admin) ne la rejouent pas
  const { count } = await prisma.ville.updateMany({
    where: { id: villeId, statut: { not: StatutVille.TOMBEE } },
    data: { statut: StatutVille.TOMBEE, dateChute: new Date() },
  });
  if (count === 0) return;
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: villeId } });

  await posterRecapitulatif(guild, villeId).catch((error) =>
    console.error(`Recapitulatif de chute de la ville ${villeId} impossible`, error),
  );

  await faireQuitterHabitants(guild, villeId);
  await purgerEtatVilleTombee(villeId);

  if (ville.groupeId !== null) await nettoyerGroupeSiTombe(guild, ville.groupeId);
});

// Etat de jeu d'une ville tombee, efface de la base : sacs et cartes de ses joueurs, banque, batiments, journal,
// attaques et gardes, elections et demandes. Restent la ville et ses personnages (historique).
export async function purgerEtatVilleTombee(villeId: number): Promise<void> {
  const joueurIds = (await prisma.joueur.findMany({ where: { villeId }, select: { id: true } })).map((j) => j.id);
  // Ordre impose par les cles etrangeres sans cascade vers Joueur (votes, gardes...)
  await prisma.$transaction([
    prisma.vote.deleteMany({ where: { OR: [{ votantId: { in: joueurIds } }, { election: { villeId } }] } }),
    prisma.candidature.deleteMany({ where: { OR: [{ joueurId: { in: joueurIds } }, { election: { villeId } }] } }),
    prisma.election.deleteMany({ where: { villeId } }),
    prisma.gardeVolontaire.deleteMany({ where: { OR: [{ joueurId: { in: joueurIds } }, { cycleAttaque: { villeId } }] } }),
    prisma.cycleAttaque.deleteMany({ where: { villeId } }),
    prisma.journalEntree.deleteMany({ where: { OR: [{ villeId }, { joueurId: { in: joueurIds } }] } }),
    prisma.contributionBatiment.deleteMany({ where: { batiment: { villeId } } }),
    prisma.batimentVille.deleteMany({ where: { villeId } }),
    prisma.inventaireVille.deleteMany({ where: { villeId } }),
    prisma.demandeInscription.deleteMany({ where: { villeId } }),
    prisma.demandeAccueil.deleteMany({ where: { OR: [{ villeId }, { joueurId: { in: joueurIds } }] } }),
    prisma.zombieErrant.deleteMany({ where: { villeId } }),
    prisma.inventaireJoueur.deleteMany({ where: { joueurId: { in: joueurIds } } }),
    prisma.carteDecouverte.deleteMany({ where: { joueurId: { in: joueurIds } } }),
    prisma.piegeConnu.deleteMany({ where: { joueurId: { in: joueurIds } } }),
    prisma.joueur.updateMany({ where: { villeId }, data: { zoneActuelleId: null, bonusPaReveil: 0, rencontrePvZombie: null, rencontreRetourZoneId: null, rencontreRetourVille: false } }),
  ]);
}

// Tous les joueurs quittent la ville tombee : roles de la ville retires, retour au role Nomade
async function faireQuitterHabitants(guild: Guild, villeId: number): Promise<void> {
  const habitants = await prisma.joueur.findMany({
    where: { villeId, dateSortie: null },
    include: { utilisateur: true },
  });
  await prisma.joueur.updateMany({ where: { villeId, dateSortie: null }, data: { dateSortie: new Date() } });
  for (const habitant of habitants) {
    await retirerJoueurDeVilleDiscord(guild, habitant.utilisateur.discordId, villeId);
  }
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
          `**Habitants :** ${ville.habitants.length} (PA max individuel de la ville : ${ville.paMaxFondation ?? "?"})`,
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

// Groupe sans ville en creation ni en jeu : ses ressources Discord, puis en base ses zones (adjacences, stocks et
// cartes supprimes en cascade) et le groupe lui-meme, les villes tombees gardant leur historique sans groupe.
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
      `salon:groupe:${groupeId}:radio`,
      ...villes.flatMap(({ id }) => [`role:ville:${id}`, `categorie:ville:${id}`]),
      ...zones.flatMap(({ id }) => [`salon:zone:${id}`, `role:position:zone:${id}`]),
    ],
    villes.map(({ id }) => `salon:ville:${id}:`),
  );

  const zoneIds = zones.map(({ id }) => id);
  await prisma.$transaction([
    prisma.joueur.updateMany({ where: { zoneActuelleId: { in: zoneIds } }, data: { zoneActuelleId: null } }),
    prisma.ville.updateMany({ where: { groupeId }, data: { groupeId: null } }),
    prisma.zone.deleteMany({ where: { groupeId } }),
    prisma.groupe.delete({ where: { id: groupeId } }),
  ]);
  return true;
}
