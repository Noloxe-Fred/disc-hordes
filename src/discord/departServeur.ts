import { StatutDemande, StatutJoueur, StatutVille } from "@prisma/client";
import type { Guild } from "discord.js";
import { prisma } from "../db";
import { trouverJoueurActif } from "../services/joueur";
import { rafraichirMessageVille, supprimerMessagesRecrutement } from "./messageVille";
import { trouverSalonTexte } from "./reconcile";
import { sortirDeVille } from "./sortie";
import { SALON_ETRANGER_PORTES } from "./structure";
import { posterDansMairie } from "./villeStructure";

// Membre qui quitte le serveur Discord (conception.md §3) : exclusion technique automatique, jamais comptee comme
// une mort. Ses demandes d'inscription en attente sont retirees ; inscrit a une ville en creation, son inscription
// disparait (s'il en etait le createur, la ville est annulee) ; habitant d'une ville en jeu, il la quitte comme par le
// bouton « Quitter la ville » de /action (place de metier liberee, mandat de maire perdu, chute si dernier vivant).
export async function gererDepartServeur(guild: Guild, discordId: string): Promise<void> {
  const utilisateur = await prisma.utilisateur.findUnique({ where: { discordId } });
  if (!utilisateur) return;
  const nom = utilisateur.pseudoCache ?? discordId;

  const demandes = await prisma.demandeInscription.findMany({ where: { utilisateurId: utilisateur.id, statut: StatutDemande.EN_ATTENTE } });
  if (demandes.length > 0) {
    await prisma.demandeInscription.updateMany({
      where: { id: { in: demandes.map((d) => d.id) } },
      data: { statut: StatutDemande.ANNULEE, dateReponse: new Date() },
    });
    const salon = await trouverSalonTexte(guild, SALON_ETRANGER_PORTES.cle);
    for (const { messageId } of demandes) {
      if (!messageId) continue;
      const message = await salon?.messages.fetch(messageId).catch(() => null);
      await message?.delete().catch(() => null);
    }
  }

  const joueur = await trouverJoueurActif(utilisateur.id);
  if (!joueur?.ville) return;
  const ville = joueur.ville;

  if (ville.statut === StatutVille.EN_CREATION) {
    if (ville.createurUtilisateurId === utilisateur.id) {
      // Plus personne pour fonder la ville : annulation, comme par son bouton « Annuler la ville »
      await supprimerMessagesRecrutement(guild, ville.id);
      await prisma.$transaction([prisma.joueur.deleteMany({ where: { villeId: ville.id } }), prisma.ville.delete({ where: { id: ville.id } })]);
      console.log(`${nom} a quitté le serveur : ville en création ${ville.nom} annulée`);
    } else {
      await prisma.joueur.delete({ where: { id: joueur.id } });
      await rafraichirMessageVille(guild, ville.id);
    }
    return;
  }

  await prisma.journalEntree.create({ data: { villeId: ville.id, joueurId: joueur.id, message: "A quitté le serveur (départ de la ville)" } });
  if (joueur.statut !== StatutJoueur.MORT && joueur.statut !== StatutJoueur.ZOMBIFIE) {
    await posterDansMairie(guild, ville.id, `🚪 **${nom}** a quitté le serveur et ne fait plus partie de **${ville.nom}**.`);
  }
  await sortirDeVille(guild, joueur.id);
}
