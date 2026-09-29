import { StatutVille } from "@prisma/client";
import { ButtonStyle, type ButtonInteraction } from "discord.js";
import { OBJET_RADIO } from "../../config/objets";
import { prisma } from "../../db";
import { synchroniserAccesJoueur } from "../joueurDiscord";
import {
  champMembre,
  champTexte,
  champVille,
  champsObjets,
  journaliser,
  lireChoix,
  lireEntier,
  lireJoueur,
  lireObjet,
  ouvrirFormulaire,
  repondre,
  type FamilleAdmin,
} from "./outils";

// Famille "Ressources" du panneau /admin (conception.md §4) : objets d'un joueur ou de la banque de ville (la faim,
// la soif et les PA s'ajustent dans la famille Joueur).

const QUANTITE_MAX = 9999;

// --- Ajouter / retirer un objet (inventaire d'un joueur ou banque de ville) ---

function modifierObjet(cible: "joueur" | "ville", sens: 1 | -1) {
  return async (interaction: ButtonInteraction) => {
    const champCible = cible === "joueur" ? champMembre() : await champVille([StatutVille.ACTIVE]);
    if (!champCible) {
      await repondre(interaction, "Aucune ville en jeu.");
      return;
    }
    const listesObjets = await champsObjets();
    const titre = `${sens > 0 ? "Ajouter" : "Retirer"} un objet (${cible === "joueur" ? "joueur" : "banque de ville"})`;
    const soumission = await ouvrirFormulaire(interaction, titre, [
      champCible,
      ...listesObjets,
      champTexte("quantite", "Quantité", { max: 4, exemple: "1" }),
    ]);
    if (!soumission) return;

    const objetId = lireObjet(soumission, listesObjets.length);
    const quantite = lireEntier(soumission.fields.getTextInputValue("quantite"), 1, QUANTITE_MAX);
    if (objetId === null) {
      await repondre(soumission, "Choisissez un objet dans une seule des listes.");
      return;
    }
    if (quantite === null) {
      await repondre(soumission, `La quantité doit être un nombre entier entre 1 et ${QUANTITE_MAX}.`);
      return;
    }
    const objet = await prisma.objet.findUniqueOrThrow({ where: { id: objetId } });

    let proprietaire: string;
    let joueurRadio: number | null = null; // radio ajoutee ou retiree du sac : acces a recalculer
    let avant: number;
    let apres: number;
    if (cible === "joueur") {
      const joueur = await lireJoueur(soumission);
      if (!joueur) {
        await repondre(soumission, "Ce membre n'a pas de personnage dans une ville en jeu.");
        return;
      }
      const ligne = await prisma.inventaireJoueur.findUnique({ where: { joueurId_objetId: { joueurId: joueur.id, objetId } } });
      avant = ligne?.quantite ?? 0;
      apres = Math.max(0, avant + sens * quantite);
      await prisma.inventaireJoueur.upsert({
        where: { joueurId_objetId: { joueurId: joueur.id, objetId } },
        update: { quantite: apres },
        create: { joueurId: joueur.id, objetId, quantite: apres },
      });
      proprietaire = `<@${joueur.utilisateur.discordId}>`;
      if (objet.nom === OBJET_RADIO) joueurRadio = joueur.id;
    } else {
      const ville = await prisma.ville.findUnique({ where: { id: Number(lireChoix(soumission, "ville")) } });
      if (ville?.statut !== StatutVille.ACTIVE) {
        await repondre(soumission, "Cette ville n'est plus en jeu.");
        return;
      }
      const ligne = await prisma.inventaireVille.findUnique({ where: { villeId_objetId: { villeId: ville.id, objetId } } });
      avant = ligne?.quantite ?? 0;
      apres = Math.max(0, avant + sens * quantite);
      await prisma.inventaireVille.upsert({
        where: { villeId_objetId: { villeId: ville.id, objetId } },
        update: { quantite: apres },
        create: { villeId: ville.id, objetId, quantite: apres },
      });
      proprietaire = `la banque de **${ville.nom}**`;
    }

    const libelle = sens > 0 ? "Ajouter un objet" : "Retirer un objet";
    await journaliser(interaction.user, libelle, `${objet.nom} : ${avant} → ${apres} (${proprietaire})`);
    await repondre(soumission, `${objet.nom} dans ${proprietaire} : ${avant} → **${apres}**.`);
    if (joueurRadio !== null) await synchroniserAccesJoueur(interaction.guild!, joueurRadio);
  };
}

export const FAMILLE_RESSOURCES: FamilleAdmin = {
  cle: "ressources",
  titre: "Ressources",
  emoji: "📦",
  resume: "objets des joueurs et des banques de ville",
  actions: [
    { cle: "ajout-joueur", libelle: "Ajouter objet (joueur)", description: "ajoute un objet à l'inventaire d'un joueur.", style: ButtonStyle.Success, executer: modifierObjet("joueur", 1) },
    { cle: "retrait-joueur", libelle: "Retirer objet (joueur)", description: "retire un objet de l'inventaire d'un joueur.", style: ButtonStyle.Danger, executer: modifierObjet("joueur", -1) },
    { cle: "ajout-ville", libelle: "Ajouter objet (ville)", description: "ajoute un objet à la banque d'une ville.", style: ButtonStyle.Success, executer: modifierObjet("ville", 1) },
    { cle: "retrait-ville", libelle: "Retirer objet (ville)", description: "retire un objet de la banque d'une ville.", style: ButtonStyle.Danger, executer: modifierObjet("ville", -1) },
  ],
};
