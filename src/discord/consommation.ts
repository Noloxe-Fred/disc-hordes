import { CauseMort, StatutJoueur, StatutVille } from "@prisma/client";
import { ModalBuilder, type ButtonInteraction, type Guild, type ModalSubmitInteraction } from "discord.js";
import { effetConsommable, libelleEffet } from "../config/consommables";
import { emojiObjet } from "../config/objets";
import { JAUGE_MAX } from "../config/sante";
import { prisma } from "../db";
import { calculerPaMax } from "../game/pa";
import { infligerDegats } from "../game/sante";
import { empechementBanque } from "./banque";
import { champQuantite, champsObjetsPossedes, lireObjetPossede, lireQuantite } from "./champsObjets";
import { prochaineBascule } from "../scheduler/cycle";
import { posterDansMairie } from "./villeStructure";

// Manger et boire (equilibrage.md §2, « Consommation ») depuis /inventaire : partout avec ce qu'on a dans son sac, et
// en ville directement dans la banque. Gratuit en PA. Les jauges remontent (plafond 100), ce qui fait remonter le
// PA max effectif tout de suite ; les PA actuels ne se rechargent qu'a la prochaine regeneration.

export type SourceConsommation = "sac" | "banque";

const DELAI_FORMULAIRE_MS = 120_000;

// Conditions pour consommer, verifiees a l'ouverture puis a la validation ; null si tout va bien
export function empechementConsommer(
  joueur: { statut: StatutJoueur; zoneActuelleId: number | null; ville: { statut: StatutVille } | null },
  source: SourceConsommation,
): string | null {
  if (source === "banque") return empechementBanque(joueur);
  if (joueur.ville?.statut !== StatutVille.ACTIVE) return "Votre ville n'est pas encore fondée.";
  if (joueur.statut !== StatutJoueur.VIVANT && joueur.statut !== StatutJoueur.EXCLU) return "Vous ne pouvez plus manger ni boire.";
  return null;
}

async function consommablesDisponibles(joueurId: number, villeId: number, source: SourceConsommation) {
  const entrees =
    source === "sac"
      ? await prisma.inventaireJoueur.findMany({ where: { joueurId, quantite: { gt: 0 } }, include: { objet: true }, orderBy: { objet: { nom: "asc" } } })
      : await prisma.inventaireVille.findMany({ where: { villeId, quantite: { gt: 0 } }, include: { objet: true }, orderBy: { objet: { nom: "asc" } } });
  return entrees.filter((e) => effetConsommable(e.objet.nom) !== undefined);
}

// Formulaire (aliment + quantite), puis consommation. Renvoie null si le formulaire n'est pas envoye ; texte seul
// (sans soumission) si rien n'est possible, le clic n'ayant alors pas ouvert de formulaire.
export async function formulaireConsommer(
  clic: ButtonInteraction,
  joueurId: number,
  source: SourceConsommation,
): Promise<{ soumission: ModalSubmitInteraction | null; texte: string } | null> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const raison = empechementConsommer(joueur, source);
  if (raison) return { soumission: null, texte: raison };
  const entrees = await consommablesDisponibles(joueurId, joueur.villeId!, source);
  if (entrees.length === 0) {
    return {
      soumission: null,
      texte: source === "sac" ? "Vous n'avez rien à manger ni à boire dans votre sac." : "La banque n'a rien à manger ni à boire.",
    };
  }

  const champs = champsObjetsPossedes(entrees, "Quoi ?", (nom) => libelleEffet(effetConsommable(nom)!));
  const idFormulaire = `consommer:${clic.id}`;
  await clic.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle(source === "sac" ? "Manger ou boire (sac)" : "Manger ou boire (banque)")
      .addLabelComponents(...champs, champQuantite()),
  );
  const soumission = await clic
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return null;
  // Accuse reception tout de suite : le traitement peut depasser les 3 s laissees par Discord
  if (soumission.isFromMessage()) await soumission.deferUpdate();

  const objetId = lireObjetPossede(soumission, champs.length);
  const quantite = lireQuantite(soumission);
  const texte =
    objetId === null
      ? "Choisissez un seul aliment."
      : quantite === null
        ? "La quantité doit être un nombre entier positif."
        : await consommer(clic.guild!, joueurId, source, objetId, quantite);
  return { soumission, texte };
}

// Consommation : reverification (acces, quantite disponible), jauges remontees et plafonnees, compteur de phases a
// vide remis a zero si la jauge remonte, bonus de PA au reveil cumule, puis jets de risque (eau brute) par unite.
async function consommer(guild: Guild, joueurId: number, source: SourceConsommation, objetId: number, quantite: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const raison = empechementConsommer(joueur, source);
  if (raison) return raison;
  const villeId = joueur.villeId!;
  const objet = await prisma.objet.findUniqueOrThrow({ where: { id: objetId } });
  const effet = effetConsommable(objet.nom);
  const nom = `${emojiObjet(objet.nom)} ${objet.nom}`;
  if (!effet) return `${nom} ne se mange pas et ne se boit pas.`;

  const sac = { where: { joueurId_objetId: { joueurId, objetId } } };
  const banque = { where: { villeId_objetId: { villeId, objetId } } };
  const stock = source === "sac" ? await prisma.inventaireJoueur.findUnique(sac) : await prisma.inventaireVille.findUnique(banque);
  if (!stock || stock.quantite < quantite) {
    return source === "sac" ? `Vous n'avez pas ${quantite} ${nom} sur vous.` : `La banque n'a plus ${quantite} ${nom} (il en reste ${stock?.quantite ?? 0}).`;
  }

  const faim = Math.min(JAUGE_MAX, joueur.faim + (effet.faim ?? 0) * quantite);
  const soif = Math.min(JAUGE_MAX, joueur.soif + (effet.soif ?? 0) * quantite);
  const bonusPa = (effet.bonusPaReveil ?? 0) * quantite;
  let pvPerdus = 0;
  if (effet.risque) for (let i = 0; i < quantite; i++) if (Math.random() < effet.risque.chance) pvPerdus += effet.risque.pv;
  const paMaxAvant = calculerPaMax(joueur).paMax;
  const apres = {
    faim,
    soif,
    phasesFaimVide: faim > 0 ? 0 : joueur.phasesFaimVide,
    phasesSoifVide: soif > 0 ? 0 : joueur.phasesSoifVide,
  };

  const enVille = joueur.zoneActuelleId === null;
  await prisma.$transaction([
    source === "sac"
      ? prisma.inventaireJoueur.update({ ...sac, data: { quantite: { decrement: quantite } } })
      : prisma.inventaireVille.update({ ...banque, data: { quantite: { decrement: quantite } } }),
    prisma.joueur.update({
      where: { id: joueurId },
      data: { ...apres, bonusPaReveil: { increment: bonusPa }, ...(effet.attenueInfection ? { infusionJusqua: prochaineBascule() } : {}) },
    }),
    prisma.journalEntree.create({
      data: {
        villeId,
        joueurId,
        message: `${source === "banque" ? "Consommé à la banque" : "Consommé"} : ${objet.nom} ×${quantite}`,
        public: source === "banque" || enVille, // rien de public en territoire externe (conception.md §7)
      },
    }),
  ]);
  const paMaxApres = calculerPaMax({ ...joueur, ...apres, ...(effet.attenueInfection ? { infusionJusqua: prochaineBascule() } : {}) }).paMax;

  const lignes = [
    `${effet.soif && !effet.faim ? "💧 Vous avez bu" : "🍲 Vous avez mangé"} **${nom} × ${quantite}**${source === "banque" ? " pris à la banque" : ""}.`,
    [
      effet.faim ? `Faim ${joueur.faim} → **${faim}** / 100` : null,
      effet.soif ? `Soif ${joueur.soif} → **${soif}** / 100` : null,
      paMaxApres !== paMaxAvant ? `PA max ${paMaxAvant} → **${paMaxApres}**` : null,
    ]
      .filter((l) => l !== null)
      .join(" · "),
  ];
  if (bonusPa > 0) lignes.push(`⚡ +${bonusPa} PA en plus à votre prochain réveil en ville.`);

  if (pvPerdus > 0) {
    const resultat = await infligerDegats(guild, joueurId, pvPerdus, CauseMort.EAU_CONTAMINEE);
    if (resultat.mort) {
      if (!resultat.villeTombee) {
        await posterDansMairie(guild, villeId, `💀 <@${joueur.utilisateur.discordId}> est mort d'avoir bu de l'eau croupie.`);
      }
      lignes.push("🤢 L'eau était croupie… elle vous a été fatale. 💀");
    } else {
      lignes.push(`🤢 L'eau était croupie : −${pvPerdus} PV (${resultat.pvRestants} restants).`);
    }
  }
  return lignes.join("\n");
}
