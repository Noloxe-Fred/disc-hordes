# Disc'Hordes — Contexte projet pour Claude Code

Bot Discord de survie zombie (inspiré Hordes/MyHordes), module de "Horror Botum Est".
Stack : Node.js/TypeScript, hébergement prévu sur NorthHost (panel Pterodactyl, serveur pas encore acheté), MySQL.

## Documents de référence (à lire avant toute implémentation)

- `docs/conception.md` : structure Discord, rôles, cycle jour/nuit, métiers, politique, IA locale, infrastructure.
- `docs/equilibrage.md` : tous les chiffres validés (PA, faim/soif, défense, loot, coûts de craft, bâtiments) — **source de vérité pour toute valeur numérique**, ne jamais inventer un chiffre qui contredit ce document.

## État du projet

- Conception V1/bêta figée sur les deux documents ci-dessus (sections "points tranchés").
- Déploiement : aucun pour l'instant (serveur NorthHost pas encore acheté ; développement et tests en local). À terme : dépôt Git avec autoupdate Pterodactyl (git pull automatique au redémarrage du serveur), redémarrage fait manuellement par l'utilisateur — pas d'automatisation du déclenchement.
- Base de données : MariaDB locale pour le développement ; MySQL fournie par l'hébergeur à terme. Prévoir un système de migrations versionnées (Prisma ou Knex) committé dans le repo plutôt que des modifications de schéma à la main.

## Notes pour Claude Code

- Toute nouvelle règle de jeu ou changement de valeur d'équilibrage doit être répercuté dans `docs/equilibrage.md`, pas seulement dans le code.
- Les règles affichées aux joueurs vivent dans `docs/regles-joueurs.md` (publiées dans #règles par le bouton « Publier les règles » du panneau `/mj`) : les mettre à jour à chaque mécanique ajoutée ou modifiée, en ne décrivant que ce qui fonctionne en jeu.
- **Interface des commandes** : aucune commande slash ne prend de paramètre. Toute saisie passe par des composants Discord — modals (champs texte, selects), boutons, selects et messages Components V2. Regrouper la saisie dans un seul modal quand c'est possible (un modal accepte champs texte et selects via des labels). Les actions admin/modération sont des boutons des panneaux `/admin` et `/mj` (le panneau `/mj` reprend les familles de `/admin` limitées aux actions ouvertes aux MJ, liste `ACTIONS_MJ` de `src/discord/boutonsAdmin.ts`), pas de nouvelles commandes.
- La table complète des rencontres humaines/bandits est explicitement hors scope V1 (voir section 11 du document d'équilibrage) — ne pas l'implémenter sans demande explicite.
