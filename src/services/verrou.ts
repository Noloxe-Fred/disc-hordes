import { AsyncLocalStorage } from "node:async_hooks";

// File d'attente unique des operations de jeu. Une operation verifie l'etat (PA, contenu du sac ou de la banque, phase...)
// puis ecrit : deux clics traites en meme temps passeraient tous deux la verification (dernier objet de la banque retire
// deux fois, PA depenses en double). Les operations s'executent donc l'une apres l'autre, joueurs, villes et horloge du
// cycle confondus (les territoires sont partages entre villes d'un meme groupe). Seul le traitement passe par la file,
// jamais l'attente d'un formulaire ou d'un clic : accuser reception de l'interaction avant d'y entrer, l'attente de son
// tour pouvant depasser les 3 s laissees par Discord (bascule de minuit, par exemple).

// Au-dela, l'operation est consideree comme bloquee (appel Discord qui ne repond plus...) : la file passe a la suivante
const DUREE_MAX_MS = 30_000;

// Vrai dans une operation en cours : ses sous-operations verrouillees s'executent directement (reentrance)
const dansLaFile = new AsyncLocalStorage<boolean>();
let derniere: Promise<void> = Promise.resolve();

export function sousVerrou<T>(operation: () => Promise<T>): Promise<T> {
  if (dansLaFile.getStore()) return operation();
  const precedente = derniere;
  let liberer!: () => void;
  derniere = new Promise<void>((resolve) => (liberer = resolve));
  return precedente.then(async () => {
    const garde = setTimeout(() => {
      console.error(`Opération de jeu bloquée depuis ${DUREE_MAX_MS / 1000} s : la file passe à la suivante`);
      liberer();
    }, DUREE_MAX_MS);
    try {
      return await dansLaFile.run(true, operation);
    } finally {
      clearTimeout(garde);
      liberer();
    }
  });
}

// Version verrouillee d'une fonction d'operation : chaque appel passe par la file
export function verrouille<A extends unknown[], R>(operation: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args) => sousVerrou(() => operation(...args));
}

// Tache d'affichage (panneau a rafraichir) lancee hors de la file, sans l'attendre : elle ne retient pas les operations
// suivantes. Une seule a la fois par cle ; demandee pendant qu'elle tourne, elle est relancee une fois a la fin, pour
// refleter le dernier etat.
const tachesEnCours = new Map<string, { relancer: boolean }>();

export function enArrierePlan(cle: string, tache: () => Promise<void>): void {
  const enCours = tachesEnCours.get(cle);
  if (enCours) {
    enCours.relancer = true;
    return;
  }
  const etat = { relancer: false };
  tachesEnCours.set(cle, etat);
  dansLaFile.exit(() => {
    void (async () => {
      do {
        etat.relancer = false;
        await tache().catch((error) => console.error(`Tâche ${cle} impossible`, error));
      } while (etat.relancer);
      tachesEnCours.delete(cle);
    })();
  });
}

// Tache periodique (minuteur) : ignoree si la precedente n'est pas terminee, pour ne pas s'empiler
export function sansChevauchement(tache: () => Promise<void>): () => Promise<void> {
  let enCours = false;
  return async () => {
    if (enCours) return;
    enCours = true;
    try {
      await tache();
    } finally {
      enCours = false;
    }
  };
}
