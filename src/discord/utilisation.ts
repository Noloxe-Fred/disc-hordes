import { StatutJoueur, StatutVille } from "@prisma/client";
import type { Guild } from "discord.js";
import {
  COUT_OUVERTURE_OBJET_RARE,
  emojiObjet,
  FAIM_FESTIN,
  LOTS_OBJET_RARE,
  OBJET_FESTIN,
  OBJET_RADIO,
  OBJET_RARE,
  poidsObjet,
} from "../config/objets";
import { JAUGE_MAX } from "../config/sante";
import { prisma } from "../db";
import { chargeSac, deborde, libelleCharge } from "../services/charge";
import { empechementBanque, rafraichirPanneauBanque } from "./banque";
import { synchroniserAccesJoueur } from "./joueurDiscord";
import { trouverSalonTexte } from "./reconcile";

// Objets qui s'utilisent depuis /inventaire (equilibrage.md §2 et §5) : l'Objet rare s'ouvre et donne un lot tire au
// hasard ; le Festin du cuisinier se sert en ville et nourrit tous les citoyens presents.

// Le sac doit pouvoir recevoir le lot le plus lourd (le lot tire ne doit pas pouvoir deborder)
function poidsMaxLot(): number {
  return Math.max(...LOTS_OBJET_RARE.map((l) => poidsObjet(l.objet) * l.quantite)) - poidsObjet(OBJET_RARE);
}

// Ouvrir un Objet rare du sac : 1 PA, un lot tire au hasard a chances egales
export async function ouvrirObjetRare(guild: Guild, joueurId: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const actif = joueur.statut === StatutJoueur.VIVANT || joueur.statut === StatutJoueur.EXCLU;
  if (!actif || joueur.ville?.statut !== StatutVille.ACTIVE) return "Vous ne pouvez plus ouvrir d'objet.";
  if (joueur.rencontrePvZombie !== null) return "🧟 Impossible avec un zombie sur le dos : combattez ou fuyez d'abord.";
  if ((joueur.paActuel ?? 0) < COUT_OUVERTURE_OBJET_RARE) {
    return `Il vous faut **${COUT_OUVERTURE_OBJET_RARE} PA** pour ouvrir un ${emojiObjet(OBJET_RARE)} ${OBJET_RARE}.`;
  }
  const entree = await prisma.inventaireJoueur.findFirst({ where: { joueurId, objet: { nom: OBJET_RARE }, quantite: { gt: 0 } } });
  if (!entree) return `Vous n'avez pas de ${emojiObjet(OBJET_RARE)} **${OBJET_RARE}** dans votre sac.`;
  const charge = await chargeSac(joueurId);
  if (deborde(charge, poidsMaxLot())) {
    return `🎒 Votre sac est trop chargé (${libelleCharge(charge)}) pour recevoir ce qu'il contient : faites un peu de place d'abord.`;
  }

  const lot = LOTS_OBJET_RARE[Math.floor(Math.random() * LOTS_OBJET_RARE.length)];
  const objet = await prisma.objet.findUniqueOrThrow({ where: { nom: lot.objet } });
  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: COUT_OUVERTURE_OBJET_RARE } } }),
    prisma.inventaireJoueur.update({ where: { id: entree.id }, data: { quantite: { decrement: 1 } } }),
    prisma.inventaireJoueur.upsert({
      where: { joueurId_objetId: { joueurId, objetId: objet.id } },
      update: { quantite: { increment: lot.quantite } },
      create: { joueurId, objetId: objet.id, quantite: lot.quantite },
    }),
    prisma.journalEntree.create({
      data: {
        villeId: joueur.villeId!,
        joueurId,
        message: `Objet rare ouvert : ${lot.objet} ×${lot.quantite}`,
        public: joueur.zoneActuelleId === null, // rien de public en territoire externe (conception.md §7)
      },
    }),
  ]);
  if (lot.objet === OBJET_RADIO) await synchroniserAccesJoueur(guild, joueurId);
  return (
    `🏺 Vous ouvrez l'objet rare (−${COUT_OUVERTURE_OBJET_RARE} PA) : il contenait **${emojiObjet(lot.objet)} ${lot.objet} × ${lot.quantite}**, ` +
    "maintenant dans votre sac."
  );
}

// Servir un Festin (sac, puis banque), gratuit en PA : +20 faim pour chaque citoyen vivant present en ville
export async function servirFestin(guild: Guild, joueurId: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  // Memes conditions que la banque : citoyen vivant, en ville
  if (empechementBanque(joueur) !== null) return "Un festin se sert en ville, par un citoyen vivant.";
  const villeId = joueur.villeId!;
  const festin = await prisma.objet.findUniqueOrThrow({ where: { nom: OBJET_FESTIN } });
  const sac = await prisma.inventaireJoueur.findUnique({ where: { joueurId_objetId: { joueurId, objetId: festin.id } } });
  const banque = await prisma.inventaireVille.findUnique({ where: { villeId_objetId: { villeId, objetId: festin.id } } });
  const source = sac && sac.quantite > 0 ? "sac" : banque && banque.quantite > 0 ? "banque" : null;
  if (!source) return `Il faut un ${emojiObjet(OBJET_FESTIN)} **${OBJET_FESTIN}** dans votre sac ou dans la banque (préparé par un cuisinier à l'atelier).`;

  const convives = await prisma.joueur.findMany({
    where: { villeId, statut: StatutJoueur.VIVANT, zoneActuelleId: null, dateSortie: null },
    include: { utilisateur: true },
  });
  await prisma.$transaction([
    source === "sac"
      ? prisma.inventaireJoueur.update({ where: { id: sac!.id }, data: { quantite: { decrement: 1 } } })
      : prisma.inventaireVille.update({ where: { id: banque!.id }, data: { quantite: { decrement: 1 } } }),
    ...convives.map((c) => prisma.joueur.update({ where: { id: c.id }, data: { faim: Math.min(JAUGE_MAX, c.faim + FAIM_FESTIN) } })),
    prisma.journalEntree.create({
      data: { villeId, joueurId, message: `Festin servi à ${convives.length} citoyen${convives.length > 1 ? "s" : ""}${source === "banque" ? " (banque)" : ""}` },
    }),
  ]);
  if (source === "banque") await rafraichirPanneauBanque(guild, villeId);
  const salon = await trouverSalonTexte(guild, `salon:ville:${villeId}:place-publique`);
  await salon
    ?.send({
      content:
        `${emojiObjet(OBJET_FESTIN)} <@${joueur.utilisateur.discordId}> sert un festin : chaque citoyen présent en ville gagne ` +
        `**+${FAIM_FESTIN} faim** (${convives.map((c) => `<@${c.utilisateur.discordId}>`).join(", ")}).`,
      allowedMentions: { users: convives.map((c) => c.utilisateur.discordId) },
    })
    .catch(() => null);
  return (
    `${emojiObjet(OBJET_FESTIN)} Vous servez un festin${source === "banque" ? " pris à la banque" : ""} : ` +
    `**+${FAIM_FESTIN} faim** pour ${convives.length} citoyen${convives.length > 1 ? "s" : ""} présent${convives.length > 1 ? "s" : ""} en ville, vous compris.`
  );
}
