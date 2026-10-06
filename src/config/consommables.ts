// Objets qui se mangent ou se boivent (equilibrage.md §2, « Consommation ») : points de faim/soif rendus (jauges
// plafonnees a 100), risque eventuel de perdre des PV (eau brute) et PA en plus a la prochaine regeneration en ville
// (ragout fortifiant). Un objet absent de la liste ne se consomme pas.

export interface EffetConsommable {
  faim?: number;
  soif?: number;
  // Chance, a chaque unite consommee, de perdre des PV
  risque?: { chance: number; pv: number };
  bonusPaReveil?: number;
  // Attenue le malus PA de l'infection jusqu'au prochain changement de phase (infusion medicinale)
  attenueInfection?: boolean;
}

const CONSOMMABLES: Record<string, EffetConsommable> = {
  // Bruts
  Baies: { faim: 5 },
  "Petit gibier": { faim: 7 },
  Gibier: { faim: 10 },
  "Gros gibier": { faim: 25 },
  "Eau brute": { soif: 10, risque: { chance: 0.2, pv: 1 } },
  // Craft simple
  "Plat préparé": { faim: 20 },
  "Ration d'eau purifiée": { soif: 30 },
  // Craft avance (cuisinier)
  "Ragoût fortifiant": { faim: 40, bonusPaReveil: 2 },
  "Conserve longue durée": { faim: 25 },
  "Infusion médicinale": { soif: 15, attenueInfection: true },
};

export function effetConsommable(nom: string): EffetConsommable | undefined {
  return CONSOMMABLES[nom];
}

// « +20 faim · +2 PA au réveil · risque −1 PV (20 %) »
export function libelleEffet(effet: EffetConsommable): string {
  return [
    effet.faim ? `+${effet.faim} faim` : null,
    effet.soif ? `+${effet.soif} soif` : null,
    effet.bonusPaReveil ? `+${effet.bonusPaReveil} PA au réveil` : null,
    effet.attenueInfection ? "soulage l'infection" : null,
    effet.risque ? `risque −${effet.risque.pv} PV (${Math.round(effet.risque.chance * 100)} %)` : null,
  ]
    .filter((l) => l !== null)
    .join(" · ");
}
