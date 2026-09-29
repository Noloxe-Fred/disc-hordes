import { TypePhase, type PalierZone } from "@prisma/client";
import {
  ARMES,
  CHANCE_FUITE,
  CHANCE_RENCONTRE,
  CHANCE_RIPOSTE,
  CHANCE_TOUCHER,
  COUT_ATTAQUE_JOUR,
  COUT_ATTAQUE_MIN,
  COUT_FUITE_JOUR,
  DEGATS_JOUEUR,
  MAJORATION_RENCONTRE_NUIT,
  type Arme,
} from "../config/combat";
import { coutSelonPhase } from "./deplacement";

// Regles du combat contre un zombie (equilibrage.md §4 et §5), sans acces a la base : tirages et couts.

export function tirerRencontre(palier: PalierZone, phase: TypePhase, alea: () => number = Math.random): boolean {
  const chance = CHANCE_RENCONTRE[palier] * (phase === TypePhase.NUIT ? MAJORATION_RENCONTRE_NUIT : 1);
  return alea() < chance;
}

// Meilleure arme du sac (ordre de ARMES), ou null
export function meilleureArme(nomsDansLeSac: Iterable<string>): Arme | null {
  const noms = new Set(nomsDansLeSac);
  return ARMES.find((a) => noms.has(a.nom)) ?? null;
}

export function coutAttaque(phase: TypePhase, arme: Arme | null): number {
  const cout = coutSelonPhase(COUT_ATTAQUE_JOUR, phase);
  return arme ? Math.max(COUT_ATTAQUE_MIN, cout - arme.reductionPa) : cout;
}

export function coutFuite(phase: TypePhase): number {
  return coutSelonPhase(COUT_FUITE_JOUR, phase);
}

export interface Echange {
  touche: boolean;
  degats: number;
  pvZombie: number;
  // Le zombie encore debout riposte et touche
  riposte: boolean;
}

export function echangerCoups(pvZombie: number, arme: Arme | null, alea: () => number = Math.random): Echange {
  const touche = alea() < CHANCE_TOUCHER + (arme?.bonusToucher ?? 0);
  const degats = touche ? (arme?.degats ?? DEGATS_JOUEUR) : 0;
  const reste = Math.max(0, pvZombie - degats);
  const riposte = reste > 0 && alea() < CHANCE_RIPOSTE;
  return { touche, degats, pvZombie: reste, riposte };
}

export function tenterFuite(phase: TypePhase, alea: () => number = Math.random): boolean {
  return alea() < CHANCE_FUITE[phase];
}
