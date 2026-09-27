# Disc'Hordes — Contexte projet pour Claude Code

Bot Discord de survie zombie (inspiré Hordes/MyHordes), module de "Horror Botum Est".
Stack : Node.js/TypeScript, hébergé sur TeoHeberg (panel Pterodactyl), MySQL.

## Documents de référence (à lire avant toute implémentation)

- `docs/conception.md` : structure Discord, rôles, cycle jour/nuit, métiers, politique, IA locale, infrastructure.
- `docs/equilibrage.md` : tous les chiffres validés (PA, faim/soif, défense, loot, coûts de craft, bâtiments) — **source de vérité pour toute valeur numérique**, ne jamais inventer un chiffre qui contredit ce document.

## État du projet

- Conception V1/bêta figée sur les deux documents ci-dessus (sections "points tranchés").
- Déploiement : dépôt Git avec autoupdate Pterodactyl (git pull automatique au redémarrage du serveur TeoHeberg), redémarrage fait manuellement par l'utilisateur — pas d'automatisation du déclenchement.
- Base de données : MySQL fournie par TeoHeberg (endpoint `database.teoheberg.fr:3306`). Prévoir un système de migrations versionnées (Prisma ou Knex) committé dans le repo plutôt que des modifications de schéma à la main.

## Notes pour Claude Code

- Toute nouvelle règle de jeu ou changement de valeur d'équilibrage doit être répercuté dans `docs/equilibrage.md`, pas seulement dans le code.
- Les règles affichées aux joueurs vivent dans `docs/regles-joueurs.md` (publiées dans #règles par le bouton « Publier les règles » du panneau `/moderation`) : les mettre à jour à chaque mécanique ajoutée ou modifiée, en ne décrivant que ce qui fonctionne en jeu.
- La table complète des rencontres humaines/bandits est explicitement hors scope V1 (voir section 11 du document d'équilibrage) — ne pas l'implémenter sans demande explicite.
