import { StatutJoueur } from "@prisma/client";
import type { Guild } from "discord.js";
import { COUT_FEU_JOUR } from "../config/deplacement";
import { emojiObjet } from "../config/objets";
import { FRACTION_PA_SIESTE } from "../config/sante";
import { prisma } from "../db";
import { coutSelonPhase } from "../game/deplacement";
import { debutPhase, feuActif } from "../game/feu";
import { calculerPaMax } from "../game/pa";
import { declencherRencontre } from "./combat";
import { trouverSalonTexte } from "./reconcile";

// Feu et sieste en territoire externe (equilibrage.md §1 et §6). Un feu allume dans une zone la securise jusqu'au
// changement de phase suivant, pour tous les survivants presents : sieste possible et rencontres deux fois moins
// probables. La sieste rend +25 % du PA max effectif, une fois par phase, apres un jet de rencontre.

export const OBJET_FEU = "Feu";

export function coutFeu(phase: Parameters<typeof coutSelonPhase>[1]): number {
  return coutSelonPhase(COUT_FEU_JOUR, phase);
}

async function joueurDehors(joueurId: number) {
  const joueur = await prisma.joueur.findUniqueOrThrow({
    where: { id: joueurId },
    include: { ville: true, zoneActuelle: true, utilisateur: true },
  });
  const actif = joueur.statut === StatutJoueur.VIVANT || joueur.statut === StatutJoueur.EXCLU;
  return actif && joueur.zoneActuelle && joueur.ville ? { ...joueur, zone: joueur.zoneActuelle, ville: joueur.ville } : null;
}

// Allumer un feu : 1 Feu du sac et 1 PA (2 la nuit), annonce dans le salon de la zone
export async function allumerFeu(guild: Guild, joueurId: number): Promise<string> {
  const joueur = await joueurDehors(joueurId);
  if (!joueur) return "Vous ne pouvez allumer un feu qu'en territoire externe.";
  if (joueur.rencontrePvZombie !== null) return "🧟 Impossible avec un zombie sur le dos : combattez ou fuyez d'abord.";
  if (feuActif(joueur.zone, joueur.ville)) return "🔥 Un feu brûle déjà ici.";
  const cout = coutFeu(joueur.ville.phaseActuelle);
  if ((joueur.paActuel ?? 0) < cout) return `Il vous faut **${cout} PA** pour allumer un feu (vous en avez ${joueur.paActuel ?? 0}).`;
  const feu = await prisma.inventaireJoueur.findFirst({ where: { joueurId, objet: { nom: OBJET_FEU }, quantite: { gt: 0 } } });
  if (!feu) return `Il vous faut un ${emojiObjet(OBJET_FEU)} **Feu** dans votre sac (2 Bois, bouton Fabriquer de \`/inventaire\`).`;

  await prisma.$transaction([
    prisma.inventaireJoueur.update({ where: { id: feu.id }, data: { quantite: { decrement: 1 } } }),
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: cout } } }),
    prisma.zone.update({ where: { id: joueur.zone.id }, data: { feuAllumeLe: new Date() } }),
    prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: `Feu allumé : ${joueur.zone.nom}`, public: false } }),
  ]);
  const salon = await trouverSalonTexte(guild, `salon:zone:${joueur.zone.id}`);
  await salon
    ?.send({
      content: `🔥 <@${joueur.utilisateur.discordId}> allume un feu : la zone est plus sûre jusqu'au changement de phase.`,
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
  return (
    `🔥 Vous allumez un feu dans **${joueur.zone.nom}** (−${cout} PA). Jusqu'au changement de phase, les zombies s'approchent ` +
    "deux fois moins, et chacun ici peut faire la sieste."
  );
}

// Sieste : zone securisee par un feu, une fois par phase ; un zombie qui surgit l'interrompt (aucun PA gagne)
export async function faireSieste(joueurId: number): Promise<string> {
  const joueur = await joueurDehors(joueurId);
  if (!joueur) return "Vous ne pouvez faire la sieste qu'en territoire externe.";
  if (joueur.rencontrePvZombie !== null) return "🧟 Impossible avec un zombie sur le dos : combattez ou fuyez d'abord.";
  if (!feuActif(joueur.zone, joueur.ville)) return "Il faut qu'un feu brûle dans la zone pour pouvoir dormir.";
  if (joueur.derniereSieste && joueur.derniereSieste >= debutPhase(joueur.ville)) {
    return "😴 Vous avez déjà fait la sieste pendant cette phase.";
  }
  const { paMax } = calculerPaMax(joueur);
  const paActuel = joueur.paActuel ?? 0;
  if (paActuel >= paMax) return `Vous êtes déjà en forme (${paActuel} / ${paMax} PA) : inutile de dormir.`;

  await prisma.joueur.update({ where: { id: joueurId }, data: { derniereSieste: new Date() } });
  const rencontre = await declencherRencontre(joueurId, joueur.zone.palier, joueur.ville.phaseActuelle, { zoneId: null, ville: false }, false);
  if (rencontre) return `😴 Vous vous assoupissez près du feu… et un grognement vous réveille en sursaut.\n\n${rencontre}`;

  const gain = Math.min(paMax - paActuel, Math.floor(paMax * FRACTION_PA_SIESTE));
  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { increment: gain } } }),
    prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: `Sieste : +${gain} PA`, public: false } }),
  ]);
  return `😴 Vous faites la sieste près du feu : **+${gain} PA** (${paActuel + gain} / ${paMax}).`;
}
