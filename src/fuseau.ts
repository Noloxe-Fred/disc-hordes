// Fuseau horaire du jeu : minuit (bascule jour/nuit, conception.md §2) et toutes les heures du bot sont celles de la
// France, quel que soit le fuseau du serveur qui l'heberge (NorthHost tourne en UTC, et Pterodactyl impose souvent
// TZ=UTC au conteneur : on l'ecrase donc). Surchargeable par FUSEAU_HORAIRE dans .env.
// Importe juste apres dotenv, avant tout calcul de date ; Node prend en compte TZ meme assigne en cours d'execution.
export const FUSEAU_HORAIRE = process.env.FUSEAU_HORAIRE || "Europe/Paris";

process.env.TZ = FUSEAU_HORAIRE;
