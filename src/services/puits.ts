import { StatutJoueur, TypeBatiment } from "@prisma/client";
import { BONUS_PUITS_PALIER_2, OBJET_EAU_PUITS, RATIONS_PUITS_PAR_HABITANT } from "../config/batiments";
import { emojiObjet, poidsObjet } from "../config/objets";
import { prisma } from "../db";
import { chargeBanque } from "./charge";

// Production du puits a l'aube (equilibrage.md §7) : rations versees dans la banque de ville tant qu'elle a de la
// place, le reste est perdu. Renvoie la ligne du compte rendu de l'aube, ou null si la ville n'a pas de puits.
export async function produireEauPuits(villeId: number): Promise<string | null> {
  const puits = await prisma.batimentVille.findUnique({ where: { villeId_type: { villeId, type: TypeBatiment.PUITS } } });
  if (!puits || puits.palierActuel < 1) return null;

  const habitants = await prisma.joueur.count({ where: { villeId, statut: StatutJoueur.VIVANT, dateSortie: null } });
  const production = Math.ceil(habitants * RATIONS_PUITS_PAR_HABITANT * (puits.palierActuel >= 2 ? 1 + BONUS_PUITS_PALIER_2 : 1));
  if (production === 0) return null;

  const objet = await prisma.objet.findUniqueOrThrow({ where: { nom: OBJET_EAU_PUITS } });
  const charge = await chargeBanque(villeId);
  const verses = Math.min(production, Math.max(0, Math.floor((charge.capacite - charge.utilisee) / poidsObjet(objet.nom))));
  const nom = `${emojiObjet(objet.nom)} ${objet.nom}`;

  if (verses > 0) {
    await prisma.$transaction([
      prisma.inventaireVille.upsert({
        where: { villeId_objetId: { villeId, objetId: objet.id } },
        update: { quantite: { increment: verses } },
        create: { villeId, objetId: objet.id, quantite: verses },
      }),
      prisma.journalEntree.create({ data: { villeId, message: `Puits : ${objet.nom} ×${verses} versées à la banque` } }),
    ]);
  }
  return (
    `🪣 Le puits remplit **${verses} ${nom}** dans la banque.` +
    (verses < production ? ` La banque est pleine : ${production - verses} perdue(s).` : "")
  );
}
