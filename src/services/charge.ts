import { TypeBatiment } from "@prisma/client";
import { CAPACITE_BANQUE_PAR_PALIER, CAPACITE_SAC, poidsObjet } from "../config/objets";
import { prisma } from "../db";

// Charge du sac et de la banque de ville (equilibrage.md §5, « Poids et capacite ») : somme des poids des objets.
// Un inventaire deja au-dessus de sa capacite garde ses objets, mais n'accepte plus rien qui l'alourdisse.

export interface Charge {
  utilisee: number;
  capacite: number;
}

export function poidsTotal(entrees: { quantite: number; objet: { nom: string } }[]): number {
  return entrees.reduce((somme, e) => somme + e.quantite * poidsObjet(e.objet.nom), 0);
}

// Vrai si ajouter ce poids (negatif pour un allegement) fait deborder l'inventaire
export function deborde(charge: Charge, ajout: number): boolean {
  return ajout > 0 && charge.utilisee + ajout > charge.capacite;
}

export async function chargeSac(joueurId: number): Promise<Charge> {
  const sac = await prisma.inventaireJoueur.findMany({ where: { joueurId, quantite: { gt: 0 } }, include: { objet: true } });
  return { utilisee: poidsTotal(sac), capacite: CAPACITE_SAC };
}

export async function chargeBanque(villeId: number): Promise<Charge> {
  const [banque, place] = await Promise.all([
    prisma.inventaireVille.findMany({ where: { villeId, quantite: { gt: 0 } }, include: { objet: true } }),
    prisma.batimentVille.findUnique({ where: { villeId_type: { villeId, type: TypeBatiment.PLACE_PUBLIQUE } } }),
  ]);
  const palier = Math.min(place?.palierActuel ?? 0, CAPACITE_BANQUE_PAR_PALIER.length - 1);
  return { utilisee: poidsTotal(banque), capacite: CAPACITE_BANQUE_PAR_PALIER[palier] };
}

// « 7 / 12 »
export function libelleCharge(charge: Charge): string {
  return `${charge.utilisee} / ${charge.capacite}`;
}

// Sac plein : plus de place meme pour un petit objet
export function sacPlein(charge: Charge): boolean {
  return deborde(charge, 1);
}

export const MESSAGE_SAC_PLEIN = "🎒 Votre sac est plein : déposez ou rangez des objets (`/inventaire`) avant de fouiller";
