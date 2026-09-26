// Etat souhaite du serveur, tel que fixe par conception.md §1 et §4. Ne couvre que la
// structure globale posee par /init : la categorie "Ville" et la categorie "Territoires
// externes" d'un groupe sont creees dynamiquement a /fonder-ville, pas ici.

export const ROLE_CITOYEN = { cle: "role:citoyen", nom: "Citoyen", couleur: 0x2ecc71 } as const; // vert : vivant
export const ROLE_MORT = { cle: "role:mort", nom: "Mort", couleur: 0xc0392b } as const; // rouge
export const ROLE_MJ_ADMIN = { cle: "role:mj-admin", nom: "MJ/Admin", couleur: 0xf1c40f } as const; // or : staff
export const ROLE_RADIO = { cle: "role:radio", nom: "Radio", couleur: 0x3498db } as const; // bleu : ondes

export const ROLES_DESIRES = [ROLE_CITOYEN, ROLE_MORT, ROLE_MJ_ADMIN, ROLE_RADIO] as const;

// Roles d'anciennes versions, supprimes par /init s'ils existent encore. L'infection est une info
// cachee (Joueur.infecteDepuis) : un role Discord la rendrait visible de tous les joueurs.
export const ROLES_OBSOLETES = ["role:infecte"] as const;

export const CATEGORIE_ADMIN_MJ = { cle: "categorie:admin-mj", nom: "Admin-MJ" } as const;

export const SALON_REGLES = { cle: "salon:regles", nom: "règles" } as const;
export const SALON_SIGNALEMENTS = { cle: "salon:signalements", nom: "signalements" } as const;
export const SALON_DISCUSSION_MJ = { cle: "salon:discussion-mj", nom: "discussion-mj" } as const;
export const SALON_FONDER_COLONIE = { cle: "salon:fonder-une-colonie", nom: "fonder-une-colonie" } as const;
