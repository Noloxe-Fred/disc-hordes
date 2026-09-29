// Etat souhaite du serveur, tel que fixe par conception.md §1 et §4. Ne couvre que la
// structure globale posee par l'initialisation (discord/initialisation.ts) : la categorie "Ville" et la categorie "Territoires
// externes" d'un groupe sont creees dynamiquement a la fondation (bouton « Fonder la ville »), pas ici.

export const ROLE_CITOYEN = { cle: "role:citoyen", nom: "Citoyen", couleur: 0x2ecc71 } as const; // vert : vivant
export const ROLE_MORT = { cle: "role:mort", nom: "Mort", couleur: 0xc0392b } as const; // rouge
// Staff : affiche a part en haut de la liste des membres, Admin au-dessus de MJ (voir initialisation.ts)
// MJ actif : voit tous les salons de jeu et a /mj, mais ne joue pas. MJ inactif : voit le serveur comme un
// joueur, plus le salon discussion-mj ; bascule entre les deux par le panneau /mj.
export const ROLE_MJ = { cle: "role:mj", nom: "MJ actif", couleur: 0xf1c40f, separe: true } as const; // or : staff jeu
export const ROLE_MJ_INACTIF = { cle: "role:mj-inactif", nom: "MJ inactif", couleur: 0x9a7d0a, separe: false } as const; // or terne
export const ROLE_ADMIN = { cle: "role:admin", nom: "Admin", couleur: 0xe67e22, separe: true } as const; // orange : staff serveur
export const ROLE_RADIO = { cle: "role:radio", nom: "Radio", couleur: 0x3498db } as const; // bleu : ondes

// Membre sans ville : donne a l'arrivee sur le serveur et apres avoir quitte une ville, retire a la fondation
export const ROLE_NOMADE = { cle: "role:nomade", nom: "Nomade", couleur: 0x95a5a6 } as const; // gris : sans ville

export const ROLES_DESIRES: readonly { cle: string; nom: string; couleur: number; separe?: boolean }[] = [
  ROLE_CITOYEN,
  ROLE_MORT,
  ROLE_MJ,
  ROLE_MJ_INACTIF,
  ROLE_ADMIN,
  ROLE_RADIO,
  ROLE_NOMADE,
];

// Roles d'anciennes versions, supprimes a l'initialisation s'ils existent encore. L'infection est une info
// cachee (Joueur.infecteDepuis) : un role Discord la rendrait visible de tous les joueurs.
export const ROLES_OBSOLETES = ["role:infecte"] as const;

// Cles renommees : l'initialisation reprend la ressource existante sous sa nouvelle cle (le role garde ses
// membres et est renomme/recolore par ensureRole). L'ancien role MJ/Admin devient le role MJ.
export const CLES_RENOMMEES = [["role:mj-admin", ROLE_MJ.cle]] as const;

export const CATEGORIE_ADMIN_MJ = { cle: "categorie:admin-mj", nom: "Admin-MJ" } as const;

export const SALON_REGLES = { cle: "salon:regles", nom: "règles" } as const;
export const SALON_SIGNALEMENTS = { cle: "salon:signalements", nom: "signalements" } as const;
export const SALON_DISCUSSION_MJ = { cle: "salon:discussion-mj", nom: "discussion-mj" } as const;
export const SALON_GESTION = { cle: "salon:gestion", nom: "gestion" } as const; // Admin uniquement
// Categorie publique d'accueil
export const CATEGORIE_DISCHORDES = { cle: "categorie:dischordes", nom: "Disc'Hordes" } as const;
export const SALON_GENERAL = { cle: "salon:general", nom: "général" } as const;
export const SALON_FONDER_COLONIE = { cle: "salon:fonder-une-colonie", nom: "fonder-une-colonie" } as const;
// Demandes d'inscription aux villes, postees par le bot (lecture seule pour les joueurs)
export const SALON_NOUVEL_ARRIVANT = { cle: "salon:nouvel-arrivant", nom: "nouvel-arrivant" } as const;
export const SALON_COMMEMORATION = { cle: "salon:commemoration", nom: "commémoration" } as const; // recaps de chute de ville
export const SALON_ANNONCES = { cle: "salon:annonces", nom: "annonces" } as const; // lecture pour tous, ecriture MJ/Admin
