import type { CauseMort } from "@prisma/client";
import type { Guild } from "discord.js";
import { CHANCE_INFECTION_PAR_COUP, PV_MAX } from "../config/sante";
import { prisma } from "../db";
import { enregistrerMort } from "./mort";

export interface ResultatDegats {
  pvRestants: number;
  mort: boolean;
  villeTombee: boolean;
}

// Point d'entree de toute perte de PV (attaque de nuit, combat rate, faim/soif). A 0 PV ou moins,
// le joueur meurt avec la cause donnee (et sa ville tombe s'il etait le dernier vivant).
export async function infligerDegats(
  guild: Guild,
  joueurId: number,
  pvPerdus: number,
  cause: CauseMort,
): Promise<ResultatDegats> {
  const joueur = await prisma.joueur.update({ where: { id: joueurId }, data: { pv: { decrement: pvPerdus } } });
  if (joueur.pv > 0) return { pvRestants: joueur.pv, mort: false, villeTombee: false };
  const villeTombee = await enregistrerMort(guild, joueurId, cause);
  return { pvRestants: joueur.pv, mort: true, villeTombee };
}

// Soin (bandage/soin basique +2, soin avance du medecin +5), plafonne a PV_MAX
export async function soigner(joueurId: number, pvRendus: number): Promise<number> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, select: { pv: true } });
  const pv = Math.min(PV_MAX, joueur.pv + pvRendus);
  await prisma.joueur.update({ where: { id: joueurId }, data: { pv } });
  return pv;
}

// Coup recu : 10 % de chance de declencher une infection (cachee), si le joueur n'est pas deja infecte.
// Renvoie true si une nouvelle infection a ete declenchee.
export async function tenterInfection(joueurId: number, alea: () => number = Math.random): Promise<boolean> {
  if (alea() >= CHANCE_INFECTION_PAR_COUP) return false;
  const { count } = await prisma.joueur.updateMany({
    where: { id: joueurId, infecteDepuis: null },
    data: { infecteDepuis: new Date() },
  });
  return count > 0;
}
