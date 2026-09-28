import { PalierZone, type Zone } from "@prisma/client";
import { PALIERS_ZONE, TYPES_ZONE } from "../config/zones";
import { prisma } from "../db";

// Graphe des territoires externes d'un groupe (conception.md §1, deplacement par adjacence) :
// - la ville (zoneActuelleId nul) donne acces aux 4 zones proches, et inversement ;
// - chaque type de zone relie proche <-> moyenne <-> eloignee ;
// - a chaque palier, les types voisins forment un anneau : ruines - foret - marecages - montagnes - ruines.
// Le lien ville <-> zones proches est une regle de code ; les autres liens sont stockes dans ZoneAdjacence.

export function nomZone(nomType: string, nomPalier: string): string {
  return `${nomType} ${nomPalier}`;
}

// Paires de noms de zones adjacentes, identiques pour tous les groupes
function pairesAdjacentes(): [string, string][] {
  const paires: [string, string][] = [];
  for (const type of TYPES_ZONE) {
    for (let i = 0; i + 1 < PALIERS_ZONE.length; i++) {
      paires.push([nomZone(type.nom, PALIERS_ZONE[i].nom), nomZone(type.nom, PALIERS_ZONE[i + 1].nom)]);
    }
  }
  for (const { nom: nomPalier } of PALIERS_ZONE) {
    TYPES_ZONE.forEach((type, i) => {
      const suivant = TYPES_ZONE[(i + 1) % TYPES_ZONE.length];
      paires.push([nomZone(type.nom, nomPalier), nomZone(suivant.nom, nomPalier)]);
    });
  }
  return paires;
}

// Idempotent : cree les liens manquants entre les zones deja creees du groupe (arete stockee une fois, A < B)
export async function ensureAdjacencesGroupe(groupeId: number): Promise<void> {
  const zones = await prisma.zone.findMany({ where: { groupeId } });
  const parNom = new Map(zones.map((z) => [z.nom, z.id]));
  for (const [nomA, nomB] of pairesAdjacentes()) {
    const a = parNom.get(nomA);
    const b = parNom.get(nomB);
    if (a === undefined || b === undefined) continue;
    const [zoneAId, zoneBId] = a < b ? [a, b] : [b, a];
    await prisma.zoneAdjacence.upsert({
      where: { zoneAId_zoneBId: { zoneAId, zoneBId } },
      update: {},
      create: { zoneAId, zoneBId },
    });
  }
}

// Destinations accessibles depuis une position (null = en ville) ; "ville" indique que la ville est accessible
export async function destinationsDepuis(
  groupeId: number,
  zoneActuelleId: number | null,
): Promise<{ zones: Zone[]; ville: boolean }> {
  if (zoneActuelleId === null) {
    const zones = await prisma.zone.findMany({ where: { groupeId, palier: PalierZone.PROCHE }, orderBy: { id: "asc" } });
    return { zones, ville: false };
  }

  const zone = await prisma.zone.findUniqueOrThrow({
    where: { id: zoneActuelleId },
    include: { adjacentesDepuis: { include: { zoneB: true } }, adjacentesVers: { include: { zoneA: true } } },
  });
  const zones = [...zone.adjacentesDepuis.map((a) => a.zoneB), ...zone.adjacentesVers.map((a) => a.zoneA)].sort(
    (a, b) => a.id - b.id,
  );
  return { zones, ville: zone.palier === PalierZone.PROCHE };
}
