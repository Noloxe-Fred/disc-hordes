<!--
Règles affichées aux joueurs dans le salon #règles, publiées par le bouton « Publier les règles » du panneau /moderation.
- Chaque titre « # » ouvre une section, publiée en image (charte MyHordes) ; un sommaire en embed renvoie à chaque
  section, et un fil sous le sommaire contient le texte brut de toutes les règles.
- Markdown compris par le rendu image : « ## » sous-titre, « > » encadré, **gras**, *italique*, `code`, emojis ;
  une ligne du fichier = une ligne affichée.
- Les noms de salons (#général, #annonces, #règles, #fonder-une-colonie, #nouvel-arrivant, #commémoration)
  sont rappelés en liens cliquables sous l'image et dans le fil.
- À tenir à jour à chaque nouvelle mécanique : ce texte ne doit décrire que ce qui fonctionne en jeu.
-->

# 🧟 Bienvenue dans Disc'Hordes

Le monde s'est effondré. Les morts marchent, et chaque nuit ils viennent frapper aux portes.
Ton seul espoir : **rejoindre une ville**, la faire tenir, et survivre le plus longtemps possible.

> ⚠️ Le jeu est en **développement actif** : certaines mécaniques arrivent progressivement. Les nouveautés seront annoncées dans #annonces.

## 🏷️ Les rôles

🔘 **Nomade** : tu n'as pas encore de ville. Tu es notifié à chaque nouvelle ville qui recrute.
🟢 **Citoyen** : tu habites une ville fondée.
🔴 **Mort** : tu es tombé… mais ton âme observe encore ta ville.
🟠 **Admin** / 🟡 **MJ actif** : l'équipe qui fait tourner le serveur et le jeu. Un MJ actif voit toute la partie et ne joue pas ; un **MJ inactif** joue comme toi, sans rien voir de plus.

## 🗺️ Les salons

💬 #général : discussion libre
📢 #annonces : les nouvelles du serveur
📜 #règles : tu es ici
🏗️ #fonder-une-colonie : les villes en recrutement
🚪 #nouvel-arrivant : les demandes pour rejoindre une ville
🕯️ #commémoration : l'hommage aux villes tombées


# 🏗️ Fonder ou rejoindre une ville

## ✨ Créer une ville
Tape `/creer-ville` : un formulaire s'ouvre pour donner le **nom** de ta ville, choisir ton **métier** et présenter ton **projet de ville** (facultatif).
Ta ville apparaît dans #fonder-une-colonie avec quatre boutons :

🔵 **Rejoindre la ville** : choisis ton métier parmi les places libres et explique tes motivations. Ta demande part dans #nouvel-arrivant.
⚪ **Quitter la ville** : retire ton inscription (ou ta demande en attente).
🟢 **Fonder la ville** : *(créateur)* lance la partie !
🔴 **Annuler la ville** : *(créateur)* abandonne le projet.

## 📋 Les règles d'inscription
👥 **15 habitants maximum** par ville.
🔢 **3 habitants minimum** pour fonder.
✅ Le créateur **accepte ou refuse** chaque demande.
☝️ Une seule ville (ou demande) à la fois.

## 🏙️ À la fondation
La ville reçoit ses salons privés : mairie, place publique, chantiers, atelier, puits, maisons privées et un vocal.
Le **créateur devient le premier maire** pour 4 cycles.
Tous les habitants deviennent **Citoyens**. Plus personne ne peut rejoindre la ville ensuite.
Les **Territoires externes** de la région (forêt, marécages, montagnes, ville en ruines) sont créés avec elle.


# 🌗 Le cycle jour / nuit

Chaque ville vit au rythme d'une **horloge commune** : le jour et la nuit durent **24h réelles** chacun, et basculent à **minuit**.

🌙 **À la tombée de la nuit**, les zombies se rassemblent… La mairie prévient toute la ville à chaque changement de phase, puis **une heure avant l'attaque**.
☀️ **À l'aube**, l'attaque frappe la ville. Si la **défense** est trop faible face à la **force de l'attaque**, les citoyens présents en ville risquent d'être **blessés**. Le compte rendu est posté dans la mairie.

📈 Les attaques deviennent **plus fortes à chaque nuit**. Une ville qui ne se défend pas finira par tomber.

😴 À chaque changement de phase, si tu es **en ville**, tu as dormi : tes **PA reviennent à leur maximum**.

# ❤️ Survivre

## 🩸 Points de vie
Tu as **10 PV**. Chaque PV perdu réduit tes **PA max de 5 %** : un survivant blessé agit moins.
💀 À **0 PV**, tu meurs.

## 🍖 Faim et 💧 soif
Deux jauges de **0 à 100**, qui baissent à chaque changement de phase. La mairie te prévient quand tu passes sous 30.
⚠️ **Sous 10**, tes **PA max baissent de 30 %** et tu perds **1 PV** par phase, pour chaque jauge.
☠️ **À 0**, tu perds **2 PV** par phase, et tes PA max baissent encore de **15 %** à chaque phase passée à vide.

## 🏠 Ta maison
Tu arrives **sans maison**. Une maison améliorée réduit tes chances d'être blessé pendant les attaques.

## 🦠 L'infection
Chaque blessure peut t'**infecter** (10 % de chance). L'infection est **secrète** : toi seul le sais, grâce à `/personnage`.
Elle réduit peu à peu tes PA… et au bout de **96h** sans remède, tu deviens **zombie**. 🧟


# 🗺️ Les territoires externes

Dans `/action`, le bouton **Se déplacer** te propose les destinations possibles et leur coût : le bot te demande de confirmer avant de dépenser tes PA.
🧭 On avance **de proche en proche** : de la ville vers les 4 zones **proches**, puis vers les zones **moyennes** et **éloignées** du même type, ou vers les zones voisines de même distance.
⚡ Coût : **2 PA** pour une zone proche (ou pour rentrer en ville), **3 PA** pour une moyenne, **4 PA** pour une éloignée. La nuit, c'est **50 % plus cher**.
🔇 Dehors, tu ne vois plus ce qui se passe en ville : seule la **mairie** reste lisible, sans pouvoir y écrire, pour suivre les annonces. Tu ne récupères pas non plus tes PA au changement de phase. Tu ne vois que le salon de la zone où tu te trouves : personne ne voit ce qui se passe dans une zone sans y être.
📻 Avec une **radio**, tu rejoins le salon **ondes-radio**, où les porteurs de radio se parlent d'une zone à l'autre. Elle ne te montre pas ta ville quand tu es dehors, mais en ville, un porteur de radio écoute les ondes et peut relayer les nouvelles à ses concitoyens. La radio se trouve dans les marécages, loin de la ville ; elle ne pèse rien et s'affiche à côté de tes PA et de ta charge.

## 🗺️ Ta carte
Chaque zone où tu mets les pieds s'ajoute à **ta carte personnelle**, à consulter avec le bouton **Carte** de `/action`. Elle montre aussi, en jaune, les citoyens de ta ville partis dehors.
👁️ Le bouton **Observer** de `/action` te montre les zones voisines sans t'y rendre : tu vois combien de survivants s'y trouvent, et elles rejoignent ta carte. Coût : **1 PA** (2 la nuit) ; pour un **Éclaireur**, c'est gratuit le jour et **1 PA** la nuit.
🤝 De retour en ville, le bouton **Partager la carte** de `/action` transmet gratuitement ta carte à un ou plusieurs citoyens, ou à toute la ville. Le partage est annoncé sur la place publique.

## 🔍 Fouiller
Dans une zone, le bouton **Fouiller** de `/action` te fait chercher ce qui traîne, pour **2 PA** (3 la nuit), après confirmation.
🎒 Tu trouves **2 à 5 objets** selon la zone (plus on s'éloigne, plus il y en a), mais certaines trouvailles ne valent rien. Tout va dans ton sac (`/inventaire`), **tant qu'il y a de la place** : ce qui ne rentre pas reste sur place et est perdu. Sac plein, tu ne peux pas fouiller.
🌲 Chaque type de zone a son butin : **bois**, baies et gibier en forêt, **eau** et plantes médicinales dans les marécages, **pierre** et ferraille en montagne, tissu, ferraille et pièces mécaniques dans la ville en ruines. Les objets rares se cachent loin de la ville.


# 🎒 Ton sac

`/inventaire` affiche ce que tu portes, en ville comme dehors.

## ⚖️ Le poids
Chaque objet pèse **1** (petit : tissu, baies, plantes, bandage, torche…), **2** (moyen : bois, ferraille, eau brute, gibier…) ou **3** (lourd : pierre, gros gibier, armes avancées…).
Ton sac porte **12** au plus : la jauge de charge est en haut de son image. Trop lourd, tu ne peux rien y ajouter de plus : ni fouiller, ni recevoir, ni fabriquer un objet qui l'alourdit, ni retirer de la banque.
⬇️ Le bouton **Déposer un objet** l'allège gratuitement. Attention : pour l'instant, un objet déposé est **perdu**.

## 🔨 Fabriquer
Le bouton **Fabriquer** transforme ce que tu as sur toi, pour **1 PA** (jour comme nuit) :
🩹 **Bandage** : 2 Tissu
🍲 **Plat préparé** : 1 Baies + 1 Gibier
🔥 **Feu** : 2 Bois
🗡️ **Arme de fortune** : 1 Ferraille + 1 Bois
🍶 **Ration d'eau purifiée** : 2 Eau brute + 1 Tissu
🔦 **Torche** : 1 Bois + 1 Tissu
🪤 **Piège simple** : 2 Bois + 1 Ferraille
🔦 La **torche** sert déjà : la nuit, en te déplaçant, tu peux en brûler une pour payer le trajet au **prix de jour**. Les autres objets fabriqués seront utilisables avec les prochaines mises à jour.

## 🤝 Donner
Le bouton **Donner** ouvre un formulaire : choisis **à qui**, **quel objet** et **combien**. C'est gratuit.
Tu ne peux donner qu'à un survivant **au même endroit** que toi : un citoyen de ta ville si tu es en ville, n'importe quel survivant de ta zone si tu es dehors. Le don est annoncé dans le salon du lieu.

## 🏦 La banque
En ville, le bouton **Banque** montre la réserve commune de ta ville. **Déposer** y range des objets de ton sac, **Retirer** en reprend : c'est gratuit, et tous les citoyens vivants présents en ville y ont accès.
⚖️ La banque porte **40** au plus, avec les mêmes poids que le sac.
📜 Chaque dépôt et chaque retrait est inscrit au journal de la ville.


# 💀 La mort et la chute

## ⚰️ Mourir
Mort, tu **vois toujours ta ville** mais tu ne peux plus y écrire ni y parler.
Avec `/action`, tu peux **quitter ta ville** pour redevenir Nomade et tenter ta chance ailleurs.

## 🕯️ La chute d'une ville
Quand le **dernier habitant vivant** meurt, la ville **tombe**.
Son histoire est gravée dans #commémoration : durée de survie, dernier maire, pire attaque, dernier survivant, et le destin de chaque habitant.
Tous ses joueurs redeviennent **Nomades**, libres de rejoindre une nouvelle ville.

# ⌨️ Les commandes

🏗️ `/creer-ville` : crée une ville et lance son recrutement
🧍 `/personnage` : tes PV, PA, faim, soif, métier, maison et le temps avant la prochaine phase
🎒 `/inventaire` : le contenu de ton sac et sa charge, pour fabriquer, donner ou déposer des objets
⚡ `/action` : tes actions possibles (te déplacer, observer les environs, fouiller une zone, voir et partager ta carte, ou quitter ta ville si tu es mort)

Toutes les réponses du bot à tes commandes ne sont visibles que par toi. 🤫

# 🚧 En préparation
⚔️ Combats · 🍲 Manger, boire et se soigner · 🔨 Chantiers et atelier · 🗳️ Élections du maire

> 🤝 Respecte les autres joueurs. Un souci ? Contacte un **MJ** ou un **Admin**.

**Bonne chance, survivant. Tu en auras besoin.** 🧟‍♂️
