import { StatutVille } from "@prisma/client";
import type { Guild } from "discord.js";
import { prisma } from "../db";
import { trouverSalonTexte } from "./reconcile";

// Journal de bord automatique (conception.md §7) : les entrees publiques du journal (actions en ville) sont reprises
// dans le salon #journal de leur ville, en lecture seule, regroupees en un message par passage. Les entrees privees
// (territoire externe, fouilles, combats...) n'y paraissent jamais : les joueurs racontent eux-memes ce qui se passe
// dehors.

export const INTERVALLE_JOURNAL_MS = 60_000;

// Limite d'un message Discord
const LONGUEUR_MAX_MESSAGE = 2000;

function decouper(lignes: string[]): string[] {
  const messages: string[] = [];
  let courant = "";
  for (const ligne of lignes) {
    const texte = ligne.length > LONGUEUR_MAX_MESSAGE ? `${ligne.slice(0, LONGUEUR_MAX_MESSAGE - 1)}…` : ligne;
    if (courant && courant.length + 1 + texte.length > LONGUEUR_MAX_MESSAGE) {
      messages.push(courant);
      courant = texte;
    } else {
      courant = courant ? `${courant}\n${texte}` : texte;
    }
  }
  if (courant) messages.push(courant);
  return messages;
}

// Poste les entrees publiques pas encore publiees de chaque ville en jeu. Une ville dont le salon est introuvable
// voit ses entrees marquees publiees (pas d'accumulation) ; un envoi en echec est retente au passage suivant.
export async function publierJournaux(guild: Guild): Promise<void> {
  const entrees = await prisma.journalEntree.findMany({
    where: { public: true, publiee: false, ville: { statut: StatutVille.ACTIVE } },
    include: { joueur: { include: { utilisateur: true } } },
    orderBy: { id: "asc" },
  });

  const parVille = new Map<number, typeof entrees>();
  for (const entree of entrees) parVille.set(entree.villeId, [...(parVille.get(entree.villeId) ?? []), entree]);

  for (const [villeId, entreesVille] of parVille) {
    const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:journal`);
    if (salon) {
      const lignes = entreesVille.map((e) => {
        const heure = `<t:${Math.floor(e.dateCreation.getTime() / 1000)}:t>`;
        return e.joueur ? `${heure} <@${e.joueur.utilisateur.discordId}> — ${e.message}` : `${heure} ${e.message}`;
      });
      let envoye = true;
      for (const contenu of decouper(lignes)) {
        // Mentions affichees sans notifier personne
        const message = await salon.send({ content: contenu, allowedMentions: { parse: [] } }).catch(() => null);
        if (!message) {
          envoye = false;
          break;
        }
      }
      if (!envoye) continue;
    }
    await prisma.journalEntree.updateMany({ where: { id: { in: entreesVille.map((e) => e.id) } }, data: { publiee: true } });
  }
}
