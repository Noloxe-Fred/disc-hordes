import { StatutDemande, StatutVille } from "@prisma/client";
import { prisma } from "../db";

// Un utilisateur ne peut etre engage que dans une seule ville a la fois (en jeu ou en cours
// de creation), ni avoir plusieurs demandes en attente en parallele : conception.md §3/§4
// ("le joueur peut annuler sa demande pour la deposer ailleurs" implique une seule a la fois).
// Un joueur mort reste engage dans sa ville tant qu'il ne l'a pas quittee (bouton de /action).
export async function utilisateurEstEngage(utilisateurId: number): Promise<boolean> {
  const [joueurActif, demandeEnAttente] = await Promise.all([
    prisma.joueur.findFirst({
      where: {
        utilisateurId,
        dateSortie: null,
        ville: { statut: { in: [StatutVille.EN_CREATION, StatutVille.ACTIVE] } },
      },
    }),
    prisma.demandeInscription.findFirst({
      where: { utilisateurId, statut: StatutDemande.EN_ATTENTE },
    }),
  ]);

  return joueurActif !== null || demandeEnAttente !== null;
}
