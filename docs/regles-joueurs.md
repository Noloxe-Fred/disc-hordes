<!--
Règles affichées aux joueurs dans le salon #règles, publiées par le bouton « Publier les règles » du panneau /mj.
- Chaque titre « # » ouvre une section, publiée en image (charte MyHordes) ; un sommaire en embed renvoie à chaque
  section, et un fil sous le sommaire contient le texte brut de toutes les règles.
- Markdown compris par le rendu image : « ## » sous-titre, « > » encadré, **gras**, *italique*, `code`, emojis ;
  une ligne du fichier = une ligne affichée.
- Une ligne « --- » dans une section ouvre une nouvelle page : une image de plus, avec le même titre de section ;
  dans le sommaire, son premier sous-titre renvoie à cette image.
- Les noms de salons (#général, #annonces, #règles, #nouvel-habitant, #fonder-une-colonie, #un-etranger-aux-portes, #commémoration)
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
👋 #nouvel-habitant : le mot d'accueil de chaque nouvel arrivant
🏗️ #fonder-une-colonie : les villes en recrutement
🚪 #un-etranger-aux-portes : les demandes pour rejoindre une ville
🕯️ #commémoration : l'hommage aux villes tombées


# 🏗️ Fonder ou rejoindre une ville

## ✨ Créer une ville
Tape `/creer-ville` : un formulaire s'ouvre pour donner le **nom** de ta ville, choisir ton **métier** (voir « Les métiers ») et présenter ton **projet de ville** (facultatif).
Ta ville apparaît dans #fonder-une-colonie avec quatre boutons :

🔵 **Rejoindre la ville** : choisis ton métier parmi les places libres et explique tes motivations. Ta demande part dans #un-etranger-aux-portes.
⚪ **Quitter la ville** : retire ton inscription (ou ta demande en attente).
🟢 **Fonder la ville** : *(créateur)* lance la partie !
🔴 **Annuler la ville** : *(créateur)* abandonne le projet.

## 📋 Les règles d'inscription
👥 **15 habitants maximum** par ville.
🔢 **3 habitants minimum** pour fonder.
✅ Le créateur **accepte ou refuse** chaque demande.
☝️ Une seule ville (ou demande) à la fois.

## 🏙️ À la fondation
La ville reçoit ses salons privés : mairie, journal, place publique, chantiers, maisons privées et un vocal. Le salon **atelier** s'ouvre quand l'atelier est construit.
🏛️ La **mairie** est le tableau d'affichage de la ville : tu la lis, mais tu n'y écris pas. On y trouve les annonces de la ville et celles du **maire**. Pour discuter, direction la **place publique**.
📜 Le **journal** raconte la vie de la ville : chaque minute, le bot y inscrit ce que les citoyens ont fait **en ville** (banque, chantiers, repas, fabrications, dons, soins, votes…). Tu le lis sans y écrire. Ce qui se passe **dehors** n'y apparaît jamais : à toi de raconter tes expéditions.
Le **créateur devient le premier maire** pour 4 cycles. Le maire publie ses annonces dans la mairie avec le bouton **Annonce** de `/action`, en notifiant ou non toute la ville.
Tous les habitants deviennent **Citoyens**. Plus personne ne peut rejoindre la ville ensuite.
👋 Un **mot d'accueil** épinglé dans la mairie rappelle à chacun l'essentiel pour bien démarrer.
Les **Territoires externes** de la région (forêt, marécages, montagnes, ville en ruines) sont créés avec elle.

---

## 🧰 Les métiers
Ton métier se choisit **une fois pour toutes**, en créant ou en rejoignant une ville. Chaque ville a un **nombre de places limité** par métier : premier arrivé, premier servi. Plus de place ? Choisis-en un autre, ou viens **sans métier**.
🛡️ **Garde** (2 places) : monter la garde la nuit rapporte **+6** de défense, au lieu de +3.
💉 **Médecin** (2 places) : seul à pratiquer le **soin avancé** (+5 PV) et à administrer le **remède contre l'infection**, qu'il fabrique à l'atelier.
🧭 **Éclaireur** (2 places) : **observer** les environs est gratuit le jour (1 PA la nuit), et entrer dans une zone qui n'est pas sur sa carte ne lui coûte **rien de plus**.
🗡️ **Artisan** (2 places) : fabrique à l'atelier les **armes avancées** (−2 PA et 2 dégâts par coup en combat).
🥘 **Cuisinier** (2 places) : prépare à l'atelier le **ragoût fortifiant** (+40 faim, +2 PA au réveil), la **conserve** (+25 faim), l'**infusion** (+15 soif, soulage l'infection) et le **festin** (+20 faim pour toute la ville).
🔧 **Ingénieur/bâtisseur** (2 places) : fabrique à l'atelier les **structures de défense** (+3 défense chacune), les **structures renforcées** (+5, atelier palier 2), et de quoi réparer la voiture (bientôt utile).
🪤 **Chasseur/trappeur** (1 place) : fabrique à l'atelier les **pièges avancés**, qui attrapent du **gros gibier**.
🙋 **Sans métier** (2 places) : pas de spécialité, mais toutes les actions de base te restent ouvertes.
> 🛠️ Les recettes de métier demandent que ta ville ait construit son **atelier** (voir « Les chantiers »).


# 🌗 Le cycle jour / nuit

Chaque ville vit au rythme d'une **horloge commune** : le jour et la nuit durent **24h réelles** chacun, et basculent à **minuit**.

🌙 **À la tombée de la nuit**, les zombies se rassemblent… La mairie prévient toute la ville à chaque changement de phase, puis **une heure avant l'attaque**.
☀️ **À l'aube**, l'attaque frappe la ville. Si la **défense** est trop faible face à la **force de l'attaque**, des citoyens présents en ville sont **blessés** au hasard, d'autant plus nombreux que l'écart est grand (une bonne **maison** aide à repousser les zombies), et les **chantiers** d'être abîmés (voir « Les chantiers »). Le compte rendu est posté dans la mairie. Et ceux qui sont restés **dehors** subissent la **horde** : bien pire (voir « Les zombies »).

🛡️ **La nuit, en ville**, le bouton **Monter la garde** de `/action` renforce la défense de l'aube : **+3** pour un citoyen, **+6** pour un **Garde**, pour **6 PA**. Il faut être encore en ville au moment de l'attaque pour que ça compte.
📈 Les attaques deviennent **plus fortes à chaque nuit**. Une ville qui ne se défend pas finira par tomber.

😴 À chaque changement de phase, si tu es **en ville**, tu as dormi : tes **PA reviennent à leur maximum**.

# ❤️ Survivre

## 🩸 Points de vie
Tu as **10 PV**. Chaque PV perdu réduit tes **PA max de 5 %** : un survivant blessé agit moins.
💀 À **0 PV**, tu meurs.

## 🍖 Faim et 💧 soif
Deux jauges de **0 à 100**, qui baissent à chaque changement de phase. La mairie te prévient quand tu passes sous 30.
📉 **Dès qu'une jauge baisse, tes PA max baissent aussi**, un peu au début puis de plus en plus : à 70, −2,7 % ; à 50, −7,5 % ; à 30, −14,7 % ; à 0, −30 %. Faim et soif se cumulent.
⚠️ **Sous 10**, tu perds en plus **1 PV** par phase, pour chaque jauge.
☠️ **À 0**, tu perds **2 PV** par phase, et tes PA max baissent encore de **15 %** à chaque phase passée à vide.
🍲 Manger et boire font remonter tes jauges, et donc **tes PA max tout de suite** (voir « Manger et boire » dans ton sac).

## 🩹 Se soigner
Le bouton **Soigner** de `/action` soigne **toi-même** ou un survivant **au même endroit** que toi (un citoyen en ville, n'importe qui dans ta zone dehors) :
🩹 **Soin basique** : **+2 PV** avec **1 Bandage**, pour **2 PA** (3 la nuit). Tout le monde peut le faire.
💊 **Soin avancé** : **+5 PV** avec **1 Médicament basique**, ou **1 Bandage + 1 Plante médicinale**, pour **4 PA** (6 la nuit). Réservé au **Médecin**.
💉 **Remède contre l'infection** : le **Médecin** l'administre gratuitement. Personne ne voit ton infection : c'est à toi de la lui avouer ! S'il soigne quelqu'un qui n'était pas infecté, le remède est perdu.
On ne dépasse jamais **10 PV**, et chaque PV rendu redonne des PA max. Soigner quelqu'un est annoncé dans le salon du lieu.

## 🏠 Ta maison
Tu arrives **sans maison** : à toi de la bâtir, dans le salon **maisons-privées** de ta ville. Même principe que les chantiers : 🎒 **Contribuer (sac)** ou 🏦 **Contribuer (banque)** pour déposer les ressources, puis 🔨 **Installer** pour y verser tes PA (**1 PA pour 2 ressources**). 🏠 **Ma maison** te montre où tu en es.
🏠 **Palier 1** : 10 Bois + 5 Tissu, 8 PA — un toit à toi.
🏡 **Palier 2** : 25 Bois + 12 Tissu, 19 PA — **+15 % de PA max** et **25 % de chances de repousser les zombies** si l'attaque tombe sur toi.
Tout ce que tu prends à la banque pour ta maison est noté au journal de la ville. 👀

## 🦠 L'infection
Chaque blessure peut t'**infecter** (10 % de chance). L'infection est **secrète** : toi seul le sais, grâce à `/personnage`.
Elle réduit peu à peu tes PA… et au bout de **96h** sans remède, tu deviens **zombie**. 🧟
Ton zombie reste là où tu t'es transformé. En ville, il se jette par surprise sur un citoyen au hasard (**−1 PV**), qui doit le combattre ; celui qui le fuit le laisse se jeter sur un autre. Dehors, il attend le premier survivant qui passe dans sa zone.


# 🗺️ Les territoires externes

Dans `/action`, le bouton **Se déplacer** te propose les destinations possibles et leur coût : le bot te demande de confirmer avant de dépenser tes PA.
🧭 On avance **de proche en proche** : de la ville vers les 4 zones **proches**, puis vers les zones **moyennes** et **éloignées** du même type, ou vers les zones voisines de même distance.
⚡ Coût : **1 PA** pour une zone proche (ou pour rentrer en ville), **2 PA** pour une moyenne, **3 PA** pour une éloignée. La nuit, c'est **50 % plus cher** (2, 3 et 5 PA).
🗺️ Entrer dans une zone qui n'est **pas encore sur ta carte** coûte **+1 PA** (jour comme nuit) : observer les environs ou se faire partager une carte avant de partir, ça paie ! L'**Éclaireur**, lui, ne paie jamais ce surcoût.
🔇 Dehors, tu ne vois plus ce qui se passe en ville : seule la **mairie** reste lisible, sans pouvoir y écrire, pour suivre les annonces (le journal t'attend à ton retour). Tu ne récupères pas non plus tes PA au changement de phase (seule une sieste près d'un feu t'en rend un peu). Tu ne vois que le salon de la zone où tu te trouves : personne ne voit ce qui se passe dans une zone sans y être.
📻 Avec une **radio**, tu rejoins le salon **ondes-radio**, où les porteurs de radio se parlent d'une zone à l'autre. Tant que ta ville n'a pas de **tour radio**, elle ne te montre pas ta ville quand tu es dehors, mais en ville, un porteur de radio écoute les ondes et peut relayer les nouvelles à ses concitoyens. La radio se trouve dans les marécages, loin de la ville ; elle ne pèse rien et s'affiche à côté de tes PA et de ta charge.
📡 Une fois la **tour radio** construite, tous les habitants vivants **en ville** rejoignent **ondes-radio**, même sans radio (dehors, il faut une radio pour capter les ondes), et un porteur de radio dehors garde l'accès à tous les salons de sa ville.

## 🗺️ Ta carte
Chaque zone où tu mets les pieds s'ajoute à **ta carte personnelle**, à consulter avec le bouton **Carte** de `/action`. Elle montre aussi, en jaune, les citoyens de ta ville partis dehors, et 🪤 les pièges que tu connais.
👁️ Le bouton **Observer** de `/action` te montre les zones voisines sans t'y rendre : tu vois combien de survivants s'y trouvent, et elles rejoignent ta carte. Coût : **1 PA** (2 la nuit) ; pour un **Éclaireur**, c'est gratuit le jour et **1 PA** la nuit.
🤝 De retour en ville, le bouton **Partager la carte** de `/action` transmet gratuitement ta carte, pièges connus compris, à un ou plusieurs citoyens, ou à toute la ville. Le partage est annoncé sur la place publique.

## 🔍 Fouiller
Dans une zone, le bouton **Fouiller** de `/action` te fait chercher ce qui traîne, pour **2 PA** (3 la nuit), après confirmation.
🎒 Tu trouves **2 à 5 objets** selon la zone (plus on s'éloigne, plus il y en a), mais certaines trouvailles ne valent rien. Tout va dans ton sac (`/inventaire`), **tant qu'il y a de la place** : ce qui ne rentre pas reste sur place et est perdu. Sac plein, tu ne peux pas fouiller.
🌲 Chaque type de zone a son butin : **bois**, baies et gibier en forêt, **eau** et plantes médicinales dans les marécages, **pierre** et ferraille en montagne, tissu, ferraille et pièces mécaniques dans la ville en ruines. Les objets rares se cachent loin de la ville.
♻️ Les zones s'épuisent à force d'être fouillées. Le **bois de forêt, les baies et le gibier repoussent** un peu chaque matin ; **tout le reste ne revient pas**. Le bot te prévient quand une zone se vide : pense à changer de coin.

## 🪤 Les pièges
Avec un piège dans ton sac, le bouton **Piège** de `/action` le pose dans ta zone, en **forêt** ou en **montagnes**, pour **1 PA** (2 la nuit). Un seul piège par zone.
🪤 Le **piège simple** (bouton Fabriquer, ouvert à tous) attrape du **gibier** (+10 faim) ; le **piège avancé** (fabriqué par le Chasseur) attrape du **gros gibier** (+25 faim).
🐇 Un **petit gibier** dans ton sac sert d'**appât** : le bouton **Appâter** du menu Piège le met dans un piège vide, gratuitement, pour **+20 points** de chances à la prochaine aube. L'appât est mangé à l'aube, prise ou pas.
🦌 Le piège reste en place. **À chaque aube**, il a **60 %** de chances d'attraper sa proie en zone proche, **75 %** en moyenne et **90 %** en éloignée, tant que la zone a encore du gibier. Il garde une seule prise à la fois : tant que personne ne vient la chercher, il n'attrape plus rien.
✋ **N'importe qui** passant dans la zone, même d'une autre ville, peut **relever la prise** gratuitement avec le bouton **Piège**. Ne tarde pas trop !
🗺️ Ton piège apparaît sur ta carte, et sur celle des citoyens avec qui tu la partages.

## 🧟 Les zombies
Après chaque fouille et à chaque arrivée dans une zone, un **zombie** peut surgir : **15 %** en zone proche, **30 %** en moyenne, **45 %** en éloignée, et **50 % de plus la nuit**. Et plus tu fouilles sans croiser de zombie, plus le bruit en attire : **+10 %** à chaque fouille d'affilée, jusqu'à ce qu'un zombie surgisse ou que tu rentres en ville. Tant qu'il est là, `/action` ne te propose que deux choix :
⚔️ **Attaquer** pour **2 PA** (3 la nuit) : tu touches 7 fois sur 10. Un zombie a **2 PV** en zone proche, **3** en moyenne, **4** en éloignée. S'il tient encore debout, il riposte (3 fois sur 10) : **−1 PV**, et chaque coup reçu peut t'**infecter**.
🏃 **Fuir** pour **1 PA** (2 la nuit) : ça marche 4 fois sur 5 le jour, 3 fois sur 5 la nuit. Tu rebrousses chemin vers l'endroit d'où tu venais (ou tu restes sur place si tu fouillais). Raté, le zombie te frappe (−1 PV, sans infection).
🗡️ Une **arme** dans ton sac aide : **arme de fortune** (−1 PA par attaque), **arme simple** (tu touches plus souvent), **arme avancée** (−2 PA et 2 dégâts par coup). Seule la meilleure compte.
🔫 Avec une **arme à feu** et des **munitions**, le bouton **Tirer** s'ajoute : **0 PA**, une munition par tir, tu touches 3 fois sur 4 (presque à coup sûr pour le **Chasseur**) et le zombie perd **3 PV**.
⏳ Un zombie qu'on laisse là ne s'en va pas : **−1 PV à la tombée de la nuit** tant que tu ne l'as pas réglé.
🌙 **À la tombée de la nuit**, si tu es dehors, un zombie peut sortir de l'ombre et te tomber dessus.
☀️ **À l'aube, la horde déferle** sur tous ceux qui sont encore dehors : **−3 PV** en zone proche, **−4** en moyenne, **−5** en éloignée (un feu allumé t'en épargne 2), puis un zombie reste sur toi. **Rentre avant l'aube !**

## 🔥 Feu et sieste
Dehors, le bouton **Allumer un feu** de `/action` brûle un **Feu** de ton sac (2 Bois, à fabriquer) pour **1 PA** (2 la nuit). Jusqu'au prochain changement de phase, la zone est plus sûre pour tous ceux qui s'y trouvent : **deux fois moins de zombies**.
😴 Tant que le feu brûle, le bouton **Sieste** te rend **25 % de tes PA max**, une fois par phase. Mais un zombie peut quand même te surprendre dans ton sommeil : la sieste est alors fichue, et il faut se battre.


# 🏗️ Les chantiers

Dans le salon **chantiers** de ta ville, un panneau montre où en est chaque bâtiment : la **palissade** (défense contre l'attaque de l'aube), la **place publique** (plus de place dans la banque), le **puits** (de l'eau chaque matin), l'**atelier**, la **tour radio** et la **mairie**.
🎒 **Contribuer (sac)** ou 🏦 **Contribuer (banque)** : dépose des ressources sur le prochain palier d'un bâtiment, depuis ton sac ou directement depuis la banque. C'est gratuit.
🔨 **Installer** : verse tes PA pour bâtir, **1 PA pour 2 ressources déposées**. La nuit, quand sortir coûte cher, c'est le bon moment pour installer. Pas besoin d'attendre que tout soit réuni : on installe au fur et à mesure.
🛡️ **Poser une structure** : une structure de défense fabriquée par un ingénieur donne **+3 défense** tant qu'elle tient, une **renforcée** **+5** (5 structures au plus en tout). Quand tout est plein, une renforcée prend la place d'une structure simple : ses ressources (Ferraille, Bois, Pierre) reviennent à la banque, s'il y a de la place.
🌳 Un **bois rare** déposé sur un chantier ou sur ta maison compte pour **5 Bois**.

## 🛠️ L'atelier
Une fois l'atelier construit, son salon s'ouvre. Lance `/inventaire` **dans ce salon** : le bouton **Craft avancé** te propose les recettes de ton métier (voir « Les métiers »). Les ingrédients viennent de ton sac, puis de la banque.
🔫 Tout le monde peut y **réparer une arme à feu cassée** (trouvée dans la ville en ruines) : **3 PA + 2 Ferraille**.
✅ Quand toutes les ressources et tous les PA sont là, le palier est construit et son effet s'applique tout de suite. La mairie l'annonce.
Il faut être **en ville**, vivant, et ne pas être affamé ni assoiffé (faim et soif d'au moins 10).
🧟 **Quand la défense ne suffit pas**, les zombies saccagent aussi les constructions, d'autant plus que l'écart est grand : d'abord les **structures de défense**, puis **un palier de palissade**, puis les **ressources et PA déjà versés** sur les chantiers et les maisons en cours, et enfin **un palier d'un bâtiment au hasard** (maisons comprises). Un palier perdu perd son effet, et il faut le reconstruire.


# 🎒 Ton sac

`/inventaire` affiche ce que tu portes, en ville comme dehors.

## ⚖️ Le poids
Chaque objet pèse **1** (petit : tissu, baies, plantes, bandage, torche…), **2** (moyen : bois, ferraille, eau brute, gibier…) ou **3** (lourd : pierre, gros gibier, armes avancées…).
Ton sac porte **20** au plus : la jauge de charge est en haut de son image. Trop lourd, tu ne peux rien y ajouter de plus : ni fouiller, ni recevoir, ni fabriquer un objet qui l'alourdit, ni retirer de la banque.
🗑️ Le bouton **Jeter un objet** l'allège gratuitement. Attention : un objet jeté est **perdu**.

## 🔨 Fabriquer
Le bouton **Fabriquer** transforme ce que tu as sur toi, pour **1 PA** (jour comme nuit) :
🩹 **Bandage** : 2 Tissu
🍲 **Plat préparé** : 1 Baies + 1 Gibier
🔥 **Feu** : 2 Bois
🗡️ **Arme de fortune** : 1 Ferraille + 1 Bois
🍶 **Ration d'eau purifiée** : 2 Eau brute + 1 Tissu
🔦 **Torche** : 1 Bois + 1 Tissu
🪤 **Piège simple** : 2 Bois + 1 Ferraille
⚙️ **Dérouiller des pièces** : 2 Pièces mécaniques rouillées + 1 Eau brute, pour 1 Pièce mécanique
🔦 La **torche** sert déjà : la nuit, en te déplaçant, tu peux en brûler une pour payer le trajet au **prix de jour**. Le plat préparé et la ration d'eau se mangent et se boivent (ci-dessous), le bandage sert à soigner, le feu à sécuriser une zone et le piège à attraper du gibier (`/action`), l'arme de fortune aide au combat. Les pièces dérouillées servent aux chantiers de l'atelier et de la tour radio.

## 🍲 Manger et boire
Le bouton **Manger / boire (sac)** consomme ce que tu as sur toi, partout, gratuitement. En ville, **Manger / boire (banque)** puise directement dans la réserve commune.
🫐 **Baies** : +5 faim
🐇 **Petit gibier** : +7 faim
🍖 **Gibier** : +10 faim
🦌 **Gros gibier** : +25 faim
🍲 **Plat préparé** : +20 faim
💧 **Eau brute** : +10 soif, mais **1 chance sur 5 de perdre 1 PV** : mieux vaut la purifier
🍶 **Ration d'eau purifiée** : +30 soif, sans risque
Une jauge ne dépasse pas **100** : ce qui déborde est perdu. Cuisiner rapporte plus que manger cru.
🍗 Un **festin** (préparé par le Cuisinier) ne se mange pas seul : en ville, le bouton **Servir un festin** donne **+20 faim à chaque citoyen présent en ville**, toi compris. Gratuit, depuis ton sac ou la banque.

## 🏺 Les objets rares
🏺 Un **objet rare** s'ouvre avec le bouton **Ouvrir l'objet rare** de `/inventaire`, pour **1 PA** : il contient une radio, une arme avancée, 2 médicaments, un remède contre l'infection ou 3 munitions. Garde un peu de place dans ton sac.
🐐 Le **gibier rare** sert au festin du Cuisinier, le **minerai rare** aux structures renforcées de l'Ingénieur, les **pièces pour voiture** à la réparation de la voiture.

## 🤝 Donner
Le bouton **Donner** ouvre un formulaire : choisis **à qui**, **quel objet** et **combien**. C'est gratuit.
Tu ne peux donner qu'à un survivant **au même endroit** que toi : un citoyen de ta ville si tu es en ville, n'importe quel survivant de ta zone si tu es dehors. Le don est annoncé dans le salon du lieu.

## 🏦 La banque
En ville, le bouton **Banque** montre la réserve commune de ta ville. **Déposer** y range des objets de ton sac, **Retirer** en reprend : c'est gratuit, et tous les citoyens vivants présents en ville y ont accès.
⚖️ La banque porte **50** au plus (**100** avec la place publique, **200** à son palier 2), avec les mêmes poids que le sac. Pleine, elle ne reçoit plus rien, pas même l'eau du puits.
📜 Chaque dépôt, chaque retrait et chaque repas pris à la banque est inscrit au journal de la ville.


# 🗳️ Le maire et les élections

🏛️ Le **maire** publie ses annonces dans la mairie. Son mandat dure **4 cycles**.
⌛ À la fin du mandat, une élection s'ouvre toute seule à l'aube, et le maire sortant assure l'**intérim** jusqu'au résultat. Personne n'est élu ? L'intérim s'arrête et la ville reste sans maire.
🪦 Le maire meurt, part, est banni, exclu ou destitué ? La mairie est vacante : une élection s'ouvre aussitôt.
🗳️ À tout moment, un citoyen vivant peut **déclencher une élection** avec le bouton **Élection** de `/action` (une seule à la fois). Un panneau apparaît dans la mairie :
🙋 **24 h de candidatures** : tout citoyen vivant peut se porter candidat (ou retirer sa candidature), même dehors. Le maire en place peut se représenter.
✅ Puis **24 h de vote**, réservé aux citoyens vivants **présents en ville**. Le vote est secret et tu peux changer d'avis jusqu'à la clôture.
🏆 Le candidat qui a le plus de voix devient maire pour 4 cycles. Seul candidat ? Il est élu d'office. Personne ne se présente ou personne ne vote ? Rien ne change.
⚖️ En cas d'égalité, un **revote de 24 h** départage les ex aequo.
Jusqu'au résultat, le maire en place garde sa fonction.

## ⚖️ Le vote de défiance
Le maire ne fait plus l'affaire ? Tout citoyen vivant (sauf le maire) peut lancer un **vote de défiance** avec le bouton **Défiance** de `/action` (un seul à la fois). Un panneau apparaît dans la mairie :
🗳️ **24 h de vote**, réservé aux citoyens vivants **présents en ville** (le maire aussi). Tu choisis **Destituer** ou **Maintenir**, en secret, et tu peux changer d'avis jusqu'à la clôture.
👢 Plus de « Destituer » que de « Maintenir » : le maire est **destitué**, la mairie est vacante et une élection s'ouvre. Il peut s'y représenter. Égalité ou personne ne vote : il reste en place.

## 🏛️ Les pouvoirs du maire
Le bouton **Maire** de `/action` ouvre son panneau :
📢 **Annonce** : publier dans la mairie.
🔨 **Bannir** un citoyen ou 🪢 l'**exécuter** : la ville vote **jusqu'au prochain changement de phase**, avec le panneau posté dans la mairie. Seuls les citoyens vivants **présents en ville** votent, et tu peux changer d'avis jusqu'à la clôture. Il faut plus de voix pour que contre.
• Banni : tu es **exclu**, tu ne peux plus entrer dans la ville ni voir ses salons, et si tu étais en ville, tu es jeté dehors.
• Exécuté : tu es **pendu**. Si tu es dehors au moment du verdict, la corde t'attend à ton retour…
🍽️ **Rationner** : portions de nourriture et d'eau par jour et par citoyen. ⭐ **Prioriser un chantier**. Ces consignes sont rappelées en tête du panneau des chantiers. Rien ne t'oblige à les suivre… mais la ville peut te bannir.

## 🏘️ Changer de ville
Dehors, le bouton **Demander l'accueil** de `/action` envoie une demande à une autre ville de ta région (ou à la tienne si tu en as été exclu). Elle s'affiche dans sa mairie et **seul son maire** l'accepte ou la refuse ; la réponse t'arrive dans le salon de ta zone.
Accueilli, tu gardes ton sac, ta carte, ton métier et tes PA, mais tu laisses ta maison derrière toi.

# 💀 La mort et la chute

## ⚰️ Mourir
Mort, tu **vois toujours ta ville** mais tu ne peux plus y écrire ni y parler.
Avec `/action`, tu peux **quitter ta ville** pour redevenir Nomade et tenter ta chance ailleurs.
🎒 Ton sac reste sur ton corps, là où tu es tombé : en ville ou dans ta zone.

## 💀 Fouiller un corps
Quand un corps gît au même endroit que toi, `/action` affiche le bouton **Fouiller un corps**. Choisis **un objet** sur l'un des corps et **combien** en prendre : c'est gratuit, tant que ton sac a de la place.
En ville, tu fouilles les citoyens de ta ville morts en ville ; dehors, n'importe quel corps de ta zone. Impossible avec un zombie sur le dos. La fouille est annoncée dans le salon du lieu.

## 🚪 Partir
Vivant, tu peux aussi **quitter ta ville pour toujours** avec le bouton **Quitter la ville** de `/action`, après confirmation. Ton départ est annoncé dans la mairie ; tu abandonnes ton personnage et ton sac, et tu redeviens **Nomade**, libre de rejoindre ou créer une autre ville, mais **jamais de revenir** dans celle-ci. Si tu étais le dernier vivant, la ville tombe.

Quitter le serveur Discord revient au même : tu quittes ta ville pour toujours (ce n'est pas compté comme une mort), et tes inscriptions ou demandes en attente sont retirées ; si tu avais créé une ville pas encore fondée, elle est annulée.

## 🕯️ La chute d'une ville
Quand le **dernier habitant vivant** meurt, la ville **tombe**.
Son histoire est gravée dans #commémoration : durée de survie, dernier maire, pire attaque, dernier survivant, et le destin de chaque habitant.
Tous ses joueurs redeviennent **Nomades**, libres de rejoindre une nouvelle ville.

# ⌨️ Les commandes

🏗️ `/creer-ville` : crée une ville et lance son recrutement
🧍 `/personnage` : tes PV, PA, faim, soif, métier, maison et le temps avant la prochaine phase
🎒 `/inventaire` : le contenu de ton sac et sa charge, pour fabriquer, donner, déposer en banque, jeter, manger ou boire, ouvrir un objet rare ou servir un festin
⚡ `/action` : tes actions possibles (te déplacer, observer les environs, fouiller une zone ou un corps, combattre, tirer sur ou fuir un zombie, allumer un feu et faire la sieste, poser, appâter ou relever un piège, voir et partager ta carte, soigner, monter la garde, déclencher une élection ou un vote de défiance, demander l'accueil d'une ville, agir en maire, quitter ta ville)
❓ `/aide` : les commandes utiles selon le salon où tu la tapes et ta situation (nomade, en ville, dehors, face à un zombie, mort)
🚩 `/signaler` : signaler à l'équipe un comportement problématique (le membre concerné, si besoin, et ce qui s'est passé) ; seuls les MJ et les Admins le lisent

Toutes les réponses du bot à tes commandes ne sont visibles que par toi. 🤫
⏳ Un seul menu `/action` reste ouvert à la fois : en rouvrir un ferme le précédent, et il faut attendre **3 secondes** entre deux `/action`.

# 🚧 Feuille de route

## 🔭 Plus tard (V2)
👻 **L'âme** : une fois mort, garder une petite influence sur la partie de ta ville
🚗 **La voiture** : réparée par l'ingénieur, pour partir en expédition à plusieurs à moindre coût
🌦️ **La météo dynamique** : le mauvais temps pèse sur les déplacements et abîme les chantiers
⭐ **XP et talents** : ton personnage progresse et améliore ses compétences
🏆 **Succès et titres** : des récompenses qui te suivent d'une partie à l'autre
🎆 **La fusée de détresse** : signaler ta zone à ta ville quand tu es coincé dehors
🔥 **Les événements en ville** : incendies, tempêtes, nourriture contaminée… racontés du point de vue des gardes
📊 **Le classement des villes** : les villes classées selon le nombre de cycles tenus, avec l'historique de leurs habitants

> 🤝 Respecte les autres joueurs. Un souci ? Contacte un **MJ** ou un **Admin**.

**Bonne chance, survivant. Tu en auras besoin.** 🧟‍♂️
