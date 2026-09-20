// Etat souhaite du serveur, tel que fixe par conception.md §1 et §4. Ne couvre que la
// structure globale posee par /init : la categorie "Ville" et la categorie "Territoires
// externes" d'un groupe sont creees dynamiquement a /fonder-ville, pas ici.

export const ROLES_DESIRES = [
  { cle: "role:citoyen", nom: "Citoyen" },
  { cle: "role:infecte", nom: "Infecté" },
  { cle: "role:mort", nom: "Mort" },
  { cle: "role:mj-admin", nom: "MJ/Admin" },
  { cle: "role:radio", nom: "Radio" },
] as const;

export const CATEGORIE_ADMIN_MJ = { cle: "categorie:admin-mj", nom: "Admin-MJ" } as const;

export const SALON_REGLES = { cle: "salon:regles", nom: "règles" } as const;
export const SALON_SIGNALEMENTS = { cle: "salon:signalements", nom: "signalements" } as const;
export const SALON_FONDER_COLONIE = { cle: "salon:fonder-une-colonie", nom: "fonder-une-colonie" } as const;
