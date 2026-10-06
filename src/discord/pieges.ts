import { StatutJoueur, TypePiege, type TypePhase } from "@prisma/client";
import type { Guild } from "discord.js";
import { emojiObjet, poidsObjet } from "../config/objets";
import { BONUS_CAPTURE_APPAT, COUT_POSE_PIEGE_JOUR, OBJET_APPAT, PIEGES, TYPES_ZONE_PIEGE } from "../config/pieges";
import { typeDeZone } from "../config/zones";
import { prisma } from "../db";
import { coutSelonPhase } from "../game/deplacement";
import { chargeSac, deborde } from "../services/charge";
import { trouverSalonTexte } from "./reconcile";

// Pieges en territoire externe (equilibrage.md §6 et §8). Un survivant pose un piege du sac (simple ou avance) dans une
// zone de foret ou de montagnes sans piege ; il reste en place, et a chaque aube il peut capturer sa proie
// (services/pieges.ts). N'importe quel survivant present dans la zone, de n'importe quelle ville, peut relever la prise.
// Le piege apparait sur la carte de son poseur et de ceux qui recoivent sa carte en partage.

export function coutPosePiege(phase: TypePhase): number {
  return coutSelonPhase(COUT_POSE_PIEGE_JOUR, phase);
}

export function piegeAutorise(nomZone: string): boolean {
  const type = typeDeZone(nomZone);
  return type !== undefined && TYPES_ZONE_PIEGE.includes(type.cle);
}

// Types de piege que le joueur a dans son sac
export async function piegesEnSac(joueurId: number): Promise<TypePiege[]> {
  const sac = await prisma.inventaireJoueur.findMany({
    where: { joueurId, quantite: { gt: 0 }, objet: { nom: { in: Object.values(PIEGES).map((p) => p.objet) } } },
    include: { objet: true },
  });
  return Object.values(TypePiege).filter((type) => sac.some((e) => e.objet.nom === PIEGES[type].objet));
}

async function joueurDehors(joueurId: number) {
  const joueur = await prisma.joueur.findUniqueOrThrow({
    where: { id: joueurId },
    include: { ville: true, zoneActuelle: { include: { piege: true } }, utilisateur: true },
  });
  const actif = joueur.statut === StatutJoueur.VIVANT || joueur.statut === StatutJoueur.EXCLU;
  return actif && joueur.zoneActuelle && joueur.ville ? { ...joueur, zone: joueur.zoneActuelle, ville: joueur.ville } : null;
}

// Poser un piege : le piege du sac et 1 PA (2 la nuit)
export async function poserPiege(guild: Guild, joueurId: number, type: TypePiege): Promise<string> {
  const { objet: nomPiege, prise } = PIEGES[type];
  const joueur = await joueurDehors(joueurId);
  if (!joueur) return "Vous ne pouvez poser un piège qu'en territoire externe.";
  if (joueur.rencontrePvZombie !== null) return "🧟 Impossible avec un zombie sur le dos : combattez ou fuyez d'abord.";
  if (!piegeAutorise(joueur.zone.nom)) return "🪤 Le gibier ne vit qu'en forêt et en montagnes : posez votre piège là-bas.";
  if (joueur.zone.piege) return "🪤 Un piège est déjà posé ici.";
  const cout = coutPosePiege(joueur.ville.phaseActuelle);
  if ((joueur.paActuel ?? 0) < cout) return `Il vous faut **${cout} PA** pour poser un piège (vous en avez ${joueur.paActuel ?? 0}).`;
  const piege = await prisma.inventaireJoueur.findFirst({ where: { joueurId, objet: { nom: nomPiege }, quantite: { gt: 0 } } });
  if (!piege) return `Il vous faut un ${emojiObjet(nomPiege)} **${nomPiege}** dans votre sac.`;

  await prisma.$transaction([
    prisma.inventaireJoueur.update({ where: { id: piege.id }, data: { quantite: { decrement: 1 } } }),
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: cout } } }),
    prisma.piege.create({ data: { zoneId: joueur.zone.id, type, poseurId: joueurId, connuPar: { create: { joueurId } } } }),
    prisma.journalEntree.create({
      data: { villeId: joueur.villeId!, joueurId, message: `${nomPiege} posé : ${joueur.zone.nom}`, public: false },
    }),
  ]);
  return (
    `🪤 Vous posez un ${emojiObjet(nomPiege)} **${nomPiege}** dans **${joueur.zone.nom}** (−${cout} PA). À chaque aube, il peut ` +
    `attraper un ${emojiObjet(prise)} **${prise}**, d'autant plus facilement que la zone est loin de la ville. Revenez ` +
    "relever la prise avant qu'un autre ne le fasse ! Il figure désormais sur votre carte."
  );
}

// Appater le piege vide de la zone avec un petit gibier du sac (gratuit) : +20 points de capture a la prochaine aube
export async function appaterPiege(joueurId: number): Promise<string> {
  const joueur = await joueurDehors(joueurId);
  if (!joueur) return "Vous ne pouvez appâter un piège qu'en territoire externe.";
  if (joueur.rencontrePvZombie !== null) return "🧟 Impossible avec un zombie sur le dos : combattez ou fuyez d'abord.";
  const piege = joueur.zone.piege;
  if (!piege) return "Il n'y a pas de piège ici.";
  if (piege.priseLe) return "🪤 Une prise attend déjà dans le piège : relevez-la d'abord.";
  if (piege.appate) return "🪤 Le piège est déjà appâté.";
  const appat = await prisma.inventaireJoueur.findFirst({ where: { joueurId, objet: { nom: OBJET_APPAT }, quantite: { gt: 0 } } });
  if (!appat) return `Il vous faut un ${emojiObjet(OBJET_APPAT)} **${OBJET_APPAT}** dans votre sac pour appâter le piège.`;

  // Un seul appat, meme si deux survivants cliquent en meme temps
  const appate = await prisma.piege.updateMany({ where: { id: piege.id, appate: false, priseLe: null }, data: { appate: true } });
  if (appate.count === 0) return "🪤 Quelqu'un vient d'appâter le piège avant vous.";
  await prisma.$transaction([
    prisma.inventaireJoueur.update({ where: { id: appat.id }, data: { quantite: { decrement: 1 } } }),
    prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: `Piège appâté : ${joueur.zone.nom}`, public: false } }),
  ]);
  return (
    `🪤 Vous appâtez le piège avec un ${emojiObjet(OBJET_APPAT)} **${OBJET_APPAT}** : **+${Math.round(BONUS_CAPTURE_APPAT * 100)} points** ` +
    "de chances de capture à la prochaine aube. L'appât sera consommé, qu'il y ait prise ou non."
  );
}

// Relever la prise du piege de la zone : la proie dans le sac, gratuit en PA
export async function releverPiege(guild: Guild, joueurId: number): Promise<string> {
  const joueur = await joueurDehors(joueurId);
  if (!joueur) return "Vous ne pouvez relever un piège qu'en territoire externe.";
  if (joueur.rencontrePvZombie !== null) return "🧟 Impossible avec un zombie sur le dos : combattez ou fuyez d'abord.";
  const piege = joueur.zone.piege;
  if (!piege) return "Il n'y a pas de piège ici.";
  if (!piege.priseLe) return "🪤 Le piège est vide pour l'instant. Il peut attraper quelque chose à chaque aube.";
  const prise = PIEGES[piege.type].prise;
  if (deborde(await chargeSac(joueurId), poidsObjet(prise))) {
    return `🎒 Votre sac est trop lourd pour emporter le ${emojiObjet(prise)} **${prise}** : faites de la place d'abord.`;
  }
  const objet = await prisma.objet.findUniqueOrThrow({ where: { nom: prise } });

  // La prise ne peut etre relevee qu'une fois, meme si deux survivants cliquent en meme temps
  const releve = await prisma.piege.updateMany({ where: { id: piege.id, priseLe: { not: null } }, data: { priseLe: null } });
  if (releve.count === 0) return "🪤 Quelqu'un vient de relever la prise avant vous.";
  await prisma.$transaction([
    prisma.inventaireJoueur.upsert({
      where: { joueurId_objetId: { joueurId, objetId: objet.id } },
      update: { quantite: { increment: 1 } },
      create: { joueurId, objetId: objet.id, quantite: 1 },
    }),
    prisma.journalEntree.create({
      data: { villeId: joueur.villeId!, joueurId, message: `Prise relevée (${prise}) : ${joueur.zone.nom}`, public: false },
    }),
  ]);
  const salon = await trouverSalonTexte(guild, `salon:zone:${joueur.zone.id}`);
  await salon
    ?.send({
      content: `🪤 <@${joueur.utilisateur.discordId}> relève le piège et en sort un ${emojiObjet(prise)} ${prise}.`,
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
  return `🪤 Vous relevez le piège : ${emojiObjet(prise)} **${prise}** dans votre sac. Le piège reste en place.`;
}
