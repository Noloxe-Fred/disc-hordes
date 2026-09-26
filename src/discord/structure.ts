// Etat souhaite du serveur, tel que fixe par conception.md §1 et §4. Ne couvre que la
// structure globale posee par /init : la categorie "Ville" et la categorie "Territoires
// externes" d'un groupe sont creees dynamiquement a /fonder-ville, pas ici.

export const ROLE_CITOYEN = { cle: "role:citoyen", nom: "Citoyen", couleur: 0x2ecc71 } as const; // vert : vivant
export const ROLE_MORT = { cle: "role:mort", nom: "Mort", couleur: 0xc0392b } as const; // rouge
export const ROLE_MJ = { cle: "role:mj", nom: "MJ", couleur: 0xf1c40f } as const; // or : staff jeu
export const ROLE_ADMIN = { cle: "role:admin", nom: "Admin", couleur: 0xe67e22 } as const; // orange : staff serveur
export const ROLE_RADIO = { cle: "role:radio", nom: "Radio", couleur: 0x3498db } as const; // bleu : ondes

export const ROLES_DESIRES = [ROLE_CITOYEN, ROLE_MORT, ROLE_MJ, ROLE_ADMIN, ROLE_RADIO] as const;

// Roles d'anciennes versions, supprimes par /init s'ils existent encore. L'infection est une info
// cachee (Joueur.infecteDepuis) : un role Discord la rendrait visible de tous les joueurs.
export const ROLES_OBSOLETES = ["role:infecte"] as const;

// Cles renommees : /init reprend la ressource existante sous sa nouvelle cle (le role garde ses
// membres et est renomme/recolore par ensureRole). L'ancien role MJ/Admin devient le role MJ.
export const CLES_RENOMMEES = [["role:mj-admin", ROLE_MJ.cle]] as const;

export const CATEGORIE_ADMIN_MJ = { cle: "categorie:admin-mj", nom: "Admin-MJ" } as const;

export const SALON_REGLES = { cle: "salon:regles", nom: "règles" } as const;
export const SALON_SIGNALEMENTS = { cle: "salon:signalements", nom: "signalements" } as const;
export const SALON_DISCUSSION_MJ = { cle: "salon:discussion-mj", nom: "discussion-mj" } as const;
export const SALON_GESTION = { cle: "salon:gestion", nom: "gestion" } as const; // Admin uniquement
export const SALON_FONDER_COLONIE = { cle: "salon:fonder-une-colonie", nom: "fonder-une-colonie" } as const;
