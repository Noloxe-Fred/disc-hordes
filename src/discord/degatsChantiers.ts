import { StatutJoueur, TypeBatiment } from "@prisma/client";
import type { Guild } from "discord.js";
import { chantier, PALIERS_MAISON } from "../config/batiments";
import { bonusStructures } from "../config/defense";
import { prisma } from "../db";
import { avancementApresDegats, planifierDegats, type Depot } from "../game/degatsChantiers";
import { rafraichirPanneauChantiers } from "./chantiers";
import { synchroniserAccesVille } from "./joueurDiscord";
import { synchroniserSalonAtelier } from "./villeStructure";

// Degats de l'attaque sur les chantiers en defense insuffisante (cascade calculee par game/degatsChantiers.ts) :
// structures de defense, palissade, avancement en cours des chantiers et des maisons privees, puis un palier perdu
// au hasard. Renvoie les lignes du compte rendu public de l'aube.

function batiments(villeId: number) {
  return prisma.batimentVille.findMany({ where: { villeId }, include: { contributions: { include: { objet: true } } } });
}

function maisons(villeId: number) {
  return prisma.joueur.findMany({
    where: { villeId, statut: StatutJoueur.VIVANT, dateSortie: null },
    include: { utilisateur: true, contributionsMaison: { include: { objet: true } } },
  });
}

function depots(contributions: { id: number; quantiteDeposee: number; objet: { nom: string } }[]): Depot[] {
  return contributions.map((c) => ({ id: c.id, nom: c.objet.nom, quantite: c.quantiteDeposee }));
}

function aDeLAvancement(contributions: { quantiteDeposee: number }[], paInstalles: number): boolean {
  return paInstalles > 0 || contributions.some((c) => c.quantiteDeposee > 0);
}

// Avancement du prochain palier d'un batiment de ville reduit de "part" et ramene sous le cout de ce palier
async function reduireAvancementBatiment(batimentId: number, part: number) {
  const b = await prisma.batimentVille.findUniqueOrThrow({ where: { id: batimentId }, include: { contributions: { include: { objet: true } } } });
  const cible = chantier(b.type).paliers[b.palierActuel] ?? null;
  const apres = avancementApresDegats(depots(b.contributions), b.paInstalles, cible, part);
  await prisma.$transaction([
    ...apres.depots.map((d) =>
      d.quantite > 0
        ? prisma.contributionBatiment.update({ where: { id: d.id }, data: { quantiteDeposee: d.quantite } })
        : prisma.contributionBatiment.delete({ where: { id: d.id } }),
    ),
    prisma.batimentVille.update({ where: { id: b.id }, data: { paInstalles: apres.paInstalles } }),
  ]);
}

async function reduireAvancementMaison(joueurId: number, part: number) {
  const j = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { contributionsMaison: { include: { objet: true } } } });
  const apres = avancementApresDegats(depots(j.contributionsMaison), j.maisonPaInstalles, PALIERS_MAISON[j.maisonPalier] ?? null, part);
  await prisma.$transaction([
    ...apres.depots.map((d) =>
      d.quantite > 0
        ? prisma.contributionMaison.update({ where: { id: d.id }, data: { quantiteDeposee: d.quantite } })
        : prisma.contributionMaison.delete({ where: { id: d.id } }),
    ),
    prisma.joueur.update({ where: { id: j.id }, data: { maisonPaInstalles: apres.paInstalles } }),
  ]);
}

async function perdrePalierBatiment(batimentId: number) {
  await prisma.batimentVille.update({ where: { id: batimentId }, data: { palierActuel: { decrement: 1 } } });
  await reduireAvancementBatiment(batimentId, 0);
}

export async function infligerDegatsChantiers(guild: Guild, villeId: number, deficit: number): Promise<string[]> {
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: villeId } });
  const avantBatiments = await batiments(villeId);
  const avantMaisons = await maisons(villeId);
  const palissade = avantBatiments.find((b) => b.type === TypeBatiment.PALISSADE);

  const plan = planifierDegats(deficit, {
    structures: ville.structuresDefense,
    renforcees: ville.structuresRenforcees,
    palierPalissade: palissade?.palierActuel ?? 0,
    avancementEnCours:
      avantBatiments.some((b) => aDeLAvancement(b.contributions, b.paInstalles)) ||
      avantMaisons.some((j) => aDeLAvancement(j.contributionsMaison, j.maisonPaInstalles)),
  });

  const lignes: string[] = [];
  const typesPerdus = new Set<TypeBatiment>();

  const detruites = plan.structuresDetruites + plan.renforceesDetruites;
  if (detruites > 0) {
    await prisma.ville.update({
      where: { id: villeId },
      data: { structuresDefense: { decrement: plan.structuresDetruites }, structuresRenforcees: { decrement: plan.renforceesDetruites } },
    });
    lignes.push(
      `🛡️ ${detruites} structure${detruites > 1 ? "s" : ""} de défense détruite${detruites > 1 ? "s" : ""}` +
        (plan.renforceesDetruites > 0 ? ` (dont ${plan.renforceesDetruites} renforcée${plan.renforceesDetruites > 1 ? "s" : ""})` : "") +
        ` (−${bonusStructures(plan.structuresDetruites, plan.renforceesDetruites)} défense).`,
    );
  }

  if (plan.palissadePerdue && palissade) {
    await perdrePalierBatiment(palissade.id);
    typesPerdus.add(TypeBatiment.PALISSADE);
    lignes.push(`🧱 La palissade est enfoncée : elle redescend au palier ${palissade.palierActuel - 1}.`);
  }

  if (plan.partAvancement > 0) {
    for (const b of await batiments(villeId)) {
      if (aDeLAvancement(b.contributions, b.paInstalles)) await reduireAvancementBatiment(b.id, plan.partAvancement);
    }
    for (const j of avantMaisons) {
      if (aDeLAvancement(j.contributionsMaison, j.maisonPaInstalles)) await reduireAvancementMaison(j.id, plan.partAvancement);
    }
    lignes.push(
      `🏗️ Les chantiers en cours sont saccagés : −${Math.round(plan.partAvancement * 100)} % des ressources déposées et des PA installés` +
        " (chantiers et maisons privées).",
    );
  }

  if (plan.palierAleatoirePerdu) {
    const candidats = [
      ...(await batiments(villeId))
        .filter((b) => b.type !== TypeBatiment.PALISSADE && b.palierActuel > 0)
        .map((b) => ({ batiment: b, joueur: null })),
      ...(await maisons(villeId)).filter((j) => j.maisonPalier > 0).map((j) => ({ batiment: null, joueur: j })),
    ];
    const cible = candidats[Math.floor(Math.random() * candidats.length)];
    if (cible?.batiment) {
      await perdrePalierBatiment(cible.batiment.id);
      typesPerdus.add(cible.batiment.type);
      const c = chantier(cible.batiment.type);
      lignes.push(`🏚️ ${c.emoji} **${c.nom}** est endommagé : il redescend au palier ${cible.batiment.palierActuel - 1}.`);
    } else if (cible?.joueur) {
      await prisma.joueur.update({ where: { id: cible.joueur.id }, data: { maisonPalier: { decrement: 1 } } });
      await reduireAvancementMaison(cible.joueur.id, 0);
      lignes.push(`🏚️ La maison de <@${cible.joueur.utilisateur.discordId}> est endommagée : elle redescend au palier ${cible.joueur.maisonPalier - 1}.`);
    }
  }

  if (lignes.length === 0) return lignes;
  await rafraichirPanneauChantiers(guild, villeId);
  // Batiment dont les effets tiennent a des salons ou des acces : l'atelier perdu ferme son salon, la tour radio ses ondes
  if (typesPerdus.has(TypeBatiment.ATELIER)) await synchroniserSalonAtelier(guild, villeId);
  if (typesPerdus.has(TypeBatiment.TOUR_RADIO)) await synchroniserAccesVille(guild, villeId);
  return lignes;
}
