import { CauseMort } from "@prisma/client";

export const LIBELLE_CAUSE_MORT: Record<CauseMort, string> = {
  [CauseMort.ATTAQUE_NOCTURNE]: "tué lors d'une attaque nocturne",
  [CauseMort.COMBAT_EXTERIEUR]: "tué en territoire externe",
  [CauseMort.FAIM]: "mort de faim",
  [CauseMort.SOIF]: "mort de soif",
  [CauseMort.INFECTION]: "transformé en zombie",
  [CauseMort.ZOMBIE_ERRANT]: "dévoré par un citoyen transformé en zombie",
  [CauseMort.EAU_CONTAMINEE]: "mort d'avoir bu de l'eau croupie",
};
