<!--
Message d'accueil posté par le bot dans la mairie d'une ville à sa fondation (épinglé) : tous les habitants sont
mentionnés, puis ce texte est affiché en image (même rendu que docs/regles-joueurs.md).
- Une seule section, ouverte par un titre « # » ; même Markdown que les règles.
- Les salons de la ville cités (#place-publique, #chantiers, #maisons-privées) sont rappelés en liens cliquables
  au-dessus de l'image.
- Ne décrire que ce qui fonctionne en jeu. Relu au démarrage du bot : redémarrer le bot après une modification.
-->

# 🏙️ Bienvenue en ville, citoyen

Ta ville est fondée : à partir de maintenant, chaque nuit compte. Voici l'essentiel pour tenir.

## ⚡ Tes PA
Chaque action coûte des **points d'action** : se déplacer, fouiller, construire, fabriquer, soigner…
😴 À chaque changement de phase, à **minuit**, tu dors si tu es **en ville** : tes PA reviennent à leur maximum. Dehors, pas de repos.

## 🍖 Faim et 💧 soif
Deux jauges de **0 à 100**, qui baissent à chaque phase (**−16** faim, **−20** soif). Plus elles sont basses, plus tes **PA max** baissent ; sous **10**, tu perds des PV.
🍲 Mange et bois avec `/inventaire`, depuis ton sac ou la banque de la ville.

## 🌗 Le jour et la nuit
☀️ Chaque **aube**, les zombies attaquent la ville : construis la **palissade** dans #chantiers, monte la garde la nuit, et **rentre avant l'aube** si tu es dehors.

## ⌨️ Tes commandes
⚡ `/action` : te déplacer, fouiller, soigner, voter… tout ce que tu peux faire là où tu es
🧍 `/personnage` : tes PV, PA, faim, soif et le temps avant la prochaine phase
🎒 `/inventaire` : ton sac, la banque, fabriquer, manger et boire
❓ `/aide` : les commandes utiles là où tu es

> 💬 Organise-toi avec les autres sur la #place-publique et bâtis ta maison dans #maisons-privées. Le détail de chaque règle est dans #règles.
