import { StatutJoueur, StatutVille } from "@prisma/client";
import { ButtonStyle, type ButtonInteraction } from "discord.js";
import { OBJET_RADIO } from "../../config/objets";
import { JAUGE_MAX } from "../../config/sante";
import { prisma } from "../../db";
import { calculerPaMax } from "../../game/pa";
import { synchroniserAccesJoueur } from "../joueurDiscord";
import {
  champMembre,
  champTexte,
  champVille,
  champsObjets,
  journaliser,
  lireAjustement,
  lireChoix,
  lireEntier,
  lireJoueur,
  lireObjet,
  ouvrirFormulaire,
  repondre,
  type FamilleAdmin,
} from "./outils";

// Famille "Ressources" du panneau /admin (conception.md §4) : objets d'un joueur ou de la banque de ville,
// ajustement de la faim, de la soif et des PA.

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

// --- Ajuster faim, soif et PA : valeur fixe ("80") ou relative ("+20", "-10"), vide = inchange ---

async function ajusterJauges(interaction: ButtonInteraction) {
  const aide = "Ex. 80, +20 ou -10 ; vide = inchangé";
  const soumission = await ouvrirFormulaire(interaction, "Ajuster faim, soif et PA", [
    champMembre(),
    champTexte("faim", "Faim (0-100)", { requis: false, max: 5, description: aide }),
    champTexte("soif", "Soif (0-100)", { requis: false, max: 5, description: aide }),
    champTexte("pa", "PA (0 au PA max effectif)", { requis: false, max: 5, description: aide }),
  ]);
  if (!soumission) return;

  const joueur = await lireJoueur(soumission);
  if (!joueur) {
    await repondre(soumission, "Ce membre n'a pas de personnage dans une ville en jeu.");
    return;
  }
  if (joueur.statut === StatutJoueur.MORT || joueur.statut === StatutJoueur.ZOMBIFIE) {
    await repondre(soumission, `<@${joueur.utilisateur.discordId}> est mort.`);
    return;
  }

  const { paMax } = calculerPaMax(joueur);
  const paActuel = joueur.paActuel ?? 0;
  const faim = lireAjustement(soumission.fields.getTextInputValue("faim"), joueur.faim, 0, JAUGE_MAX);
  const soif = lireAjustement(soumission.fields.getTextInputValue("soif"), joueur.soif, 0, JAUGE_MAX);
  const pa = lireAjustement(soumission.fields.getTextInputValue("pa"), paActuel, 0, paMax);
  if (faim === null || soif === null || pa === null) {
    await repondre(soumission, "Saisie invalide : indiquez un nombre (80), ou un ajustement (+20, -10).");
    return;
  }
  if (faim === undefined && soif === undefined && pa === undefined) {
    await repondre(soumission, "Aucune valeur saisie : rien n'a changé.");
    return;
  }

  await prisma.joueur.update({
    where: { id: joueur.id },
    data: {
      faim,
      soif,
      paActuel: pa,
      // Une jauge remontee au-dessus de 0 remet a zero son compteur de phases a vide (malus de PA)
      ...(faim !== undefined && faim > 0 ? { phasesFaimVide: 0 } : {}),
      ...(soif !== undefined && soif > 0 ? { phasesSoifVide: 0 } : {}),
    },
  });

  const changements = [
    faim !== undefined ? `faim ${joueur.faim} → ${faim}` : null,
    soif !== undefined ? `soif ${joueur.soif} → ${soif}` : null,
    pa !== undefined ? `PA ${paActuel} → ${pa} (max ${paMax})` : null,
  ]
    .filter((ligne) => ligne !== null)
    .join(", ");
  await journaliser(
    interaction.user,
    "Ajuster faim/soif/PA",
    `${joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId} (${joueur.ville?.nom}) : ${changements}`,
  );
  await repondre(soumission, `<@${joueur.utilisateur.discordId}> : ${changements}.`);
}

export const FAMILLE_RESSOURCES: FamilleAdmin = {
  cle: "ressources",
  titre: "Ressources",
  emoji: "📦",
  resume: "objets des joueurs et des banques de ville, faim, soif et PA",
  actions: [
    { cle: "ajout-joueur", libelle: "Ajouter objet (joueur)", description: "ajoute un objet à l'inventaire d'un joueur.", style: ButtonStyle.Success, executer: modifierObjet("joueur", 1) },
    { cle: "retrait-joueur", libelle: "Retirer objet (joueur)", description: "retire un objet de l'inventaire d'un joueur.", style: ButtonStyle.Danger, executer: modifierObjet("joueur", -1) },
    { cle: "ajout-ville", libelle: "Ajouter objet (ville)", description: "ajoute un objet à la banque d'une ville.", style: ButtonStyle.Success, executer: modifierObjet("ville", 1) },
    { cle: "retrait-ville", libelle: "Retirer objet (ville)", description: "retire un objet de la banque d'une ville.", style: ButtonStyle.Danger, executer: modifierObjet("ville", -1) },
    {
      cle: "jauges",
      libelle: "Ajuster faim/soif/PA",
      description: "fixe (80) ou ajuste (+20, -10) la faim, la soif et les PA d'un joueur ; les PA sont plafonnés au PA max effectif.",
      executer: ajusterJauges,
    },
  ],
};
