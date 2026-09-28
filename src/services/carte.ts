import { StatutJoueur, type PalierZone } from "@prisma/client";
import { PALIERS_ZONE, TYPES_ZONE } from "../config/zones";
import { prisma } from "../db";
import { nomZone } from "./zones";

// Carte de decouverte individuelle (conception.md §1) : zones visitees, observees ou recues d'un autre joueur.

// Ajoute des zones a la carte d'un joueur ; renvoie le nombre de zones qu'il ne connaissait pas encore
export async function ajouterACarte(joueurId: number, zoneIds: number[]): Promise<number> {
  if (zoneIds.length === 0) return 0;
  const resultat = await prisma.carteDecouverte.createMany({
    data: zoneIds.map((zoneId) => ({ joueurId, zoneId })),
    skipDuplicates: true,
  });
  return resultat.count;
}

export async function zonesDecouvertes(joueurId: number): Promise<number[]> {
  const lignes = await prisma.carteDecouverte.findMany({ where: { joueurId }, select: { zoneId: true } });
  return lignes.map((l) => l.zoneId);
}

export interface CaseCarte {
  zoneId: number;
  nomType: string;
  decouverte: boolean;
  ici: boolean;
}

// Zones du groupe rangees par palier (proche -> eloignee) puis par type dans l'ordre de l'anneau
// (ville en ruines - foret - marecages - montagnes), avec l'etat de decouverte du joueur
export async function grilleCarte(
  groupeId: number,
  joueurId: number,
  zoneActuelleId: number | null,
): Promise<{ palier: PalierZone; cases: CaseCarte[] }[]> {
  const [zones, decouvertes] = await Promise.all([
    prisma.zone.findMany({ where: { groupeId } }),
    zonesDecouvertes(joueurId),
  ]);
  const connues = new Set(decouvertes);
  return PALIERS_ZONE.map(({ palier, nom: nomPalier }) => ({
    palier,
    cases: TYPES_ZONE.flatMap((type) => {
      const zone = zones.find((z) => z.nom === nomZone(type.nom, nomPalier));
      return zone
        ? [{ zoneId: zone.id, nomType: type.nom, decouverte: connues.has(zone.id), ici: zone.id === zoneActuelleId }]
        : [];
    }),
  }));
}

// Citoyens de la ville hors les murs (vivants ou exclus, ni en ville ni sortis), sauf le joueur lui-meme :
// la carte d'un joueur montre ou sont ses concitoyens, jamais les joueurs des autres villes (conception.md §1)
export function citoyensDehors(villeId: number, joueurId: number) {
  return prisma.joueur.findMany({
    where: {
      villeId,
      id: { not: joueurId },
      zoneActuelleId: { not: null },
      statut: { in: [StatutJoueur.VIVANT, StatutJoueur.EXCLU] },
      dateSortie: null,
    },
    include: { utilisateur: true, zoneActuelle: true },
    orderBy: { id: "asc" },
  });
}
