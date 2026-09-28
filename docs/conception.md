# Disc'Hordes — Document de conception (V1 bêta, cadrage complet)

Jeu Discord de survie zombie inspiré de *Hordes/MyHordes*, envisagé comme module de **Horror Botum Est**. Inspiré du concept, pas un clone à l'identique.

> **Mise à jour** : déclenchement de l'infection formalisé, sévérité du risque de défense/nuit renvoyée au document d'équilibrage, stub v0.1 pour les rencontres en territoire externe ; points d'équilibrage de la section 10 du document d'équilibrage tranchés (croissance de l'attaque, loot rare, malus infection, stock de ressources naturelles) — voir document d'équilibrage pour le détail.

---

## 1. Structure Discord

**Catégorie "Ville"** : mairie, place publique, chantiers, atelier, puits, maisons privées, **un salon vocal général lié au rôle-ville**.
**Catégorie "Territoires externes"** (une par groupe de villes, créée à la fondation de la première ville du groupe) : 12 salons de zone, un par type de zone (ville en ruines, forêt, marécages, montagnes) et par palier (proche, moyenne, éloignée), ex. `forêt-proche` — **partagée entre les villes d'un même groupe** (voir section Multi-villes ci-dessous). La catégorie n'est visible que par les rôles-ville du groupe ; chaque salon de zone n'est visible que du joueur qui s'y trouve (rôle Position). Pas de vocal par zone. La catégorie contient aussi un salon `ondes-radio` par groupe, ouvert membre par membre aux porteurs de radio, en ville comme dehors : ils s'y parlent d'une zone à l'autre, et un porteur resté en ville relaie les nouvelles à ses concitoyens (partagé entre les villes du groupe). Le reste de la ville n'y accède qu'avec la Tour Radio (bâtiment à chiffrer).
**Catégorie "Disc'Hordes"** (publique, créée par l'initialisation du serveur) : salon `général` de discussion, salon `fonder-une-colonie` (commandes pré-jeu et annonces des villes en création), salon `nouvel-arrivant` (demandes d'inscription aux villes postées par le bot, en lecture seule pour les joueurs), salon `annonces`, salon `règles` et salon `commémoration` (récapitulatifs des villes tombées) — ces trois derniers consultables par tous, en lecture seule : seuls MJ et Admins y écrivent.
**Catégorie "Admin-MJ"**, incluant un salon de signalements (voir section 4), un salon `discussion-mj` pour la coordination entre MJ, et un salon `gestion` réservé aux Admins. Les salons de la catégorie accessibles aux MJ le sont aussi aux Admins.

**Rôles** :
- **Citoyen** : appartenance générale à une ville.
- **Rôle-ville** (créé à la fondation de la ville, un par ville) : donne la visibilité de la catégorie "Territoires externes" du groupe auquel la ville appartient, et la visibilité/écriture de base dans sa propre catégorie Ville.
- **Position:<zone>** (ex. `Position:Forêt proche · G1`) : rôle **propre à une zone d'un groupe** (12 par groupe, créés avec les territoires externes du groupe) — seul accès (lecture et écriture) au salon de la zone précise, attribué au joueur qui s'y déplace et retiré quand il en part. Un rôle de position ne donne donc jamais accès aux zones d'un autre groupe. Contrepartie : le nombre de rôles croît avec le nombre de groupes (Discord limite un serveur à 250 rôles ; avec 15 rôles par groupe — 12 positions + 3 rôles-ville — et les rôles fixes, le plafond est d'environ 16 groupes, soit 48 villes simultanées).
- **Radio** : géré automatiquement par le bot selon la possession de l'objet radio en inventaire (ajout/retrait synchronisé, pas de commande d'activation). Donne l'accès au salon `ondes-radio` du groupe, en ville comme dehors : c'est le seul lien entre la ville et ceux qui sont dehors. La radio ne pèse rien : elle s'affiche à part dans l'image du sac, à côté des PA et de la charge. Un joueur en territoire externe, radio ou non, ne voit plus que la mairie de sa ville, en lecture seule (annonces de cycle et d'attaque) : les autres salons de la ville lui sont masqués jusqu'à son retour, tant que la ville n'a pas de Tour Radio (qui rendra la ville visible depuis dehors aux seuls porteurs de radio). Accès recalculés par le bot à chaque déplacement, changement de statut ou radio gagnée/perdue (permissions propres au membre sur les salons).
- **Mort**.
- **Nomade** : membre sans ville en jeu. Donné à chaque nouvel arrivant sur le serveur (et par l'initialisation du serveur aux membres déjà présents sans ville), retiré à la fondation de sa ville, rendu quand il quitte sa ville ou quand elle tombe. Mentionné dans l'annonce de chaque ville créée par `/creer-ville` (notification au premier envoi seulement).
- **MJ** : animation et arbitrage du jeu ; accès aux salons MJ de la catégorie Admin-MJ.
- **Admin** : gestion du serveur et du bot ; accès à tous les salons de la catégorie Admin-MJ, y compris `gestion` qui lui est réservé.
- Admin et MJ sont placés par l'initialisation du serveur en haut de la liste des rôles (Admin au-dessus de MJ, juste sous le rôle du bot) et affichés séparément des autres membres.
- Couleurs des rôles fixes posés par l'initialisation du serveur : Citoyen vert, Mort rouge, MJ or, Admin orange, Radio bleu, Nomade gris.
- **Pas de rôle Infecté** : l'infection est cachée (seul le joueur le sait, voir Blessures & infection), elle est donc stockée uniquement en base et jamais exposée via un rôle Discord visible des autres joueurs.

- Se déplacer entre zones = changement de rôle Discord (accès/retrait de salon)
- Déplacement par **adjacence** : on traverse les zones intermédiaires plutôt que de sauter directement, pour permettre des événements en chemin et complexifier l'accès aux zones éloignées
- **Graphe des zones** (identique pour tous les groupes) : la ville donne accès aux 4 zones proches ; chaque type de zone relie proche ↔ moyenne ↔ éloignée ; à chaque palier, les types voisins forment un anneau (ville en ruines – forêt – marécages – montagnes – ville en ruines). On ne rentre en ville que depuis une zone proche
- Trajet joué zone par zone, une commande par étape (pas de trajet multi-zones simulé d'un coup)
- Dans une nouvelle zone, le joueur voit les zones adjacentes accessibles depuis là → un éclaireur peut constituer une "carte"
- Découverte de zones individuelle ; bouton « Partager la carte » de `/action` pour la transmettre aux autres en rentrant d'une zone ; bouton « Carte » de `/action` pour consulter sa propre carte découverte à tout moment
- Une zone rejoint la carte quand le joueur y entre, quand il l'**observe** depuis une zone adjacente (ou depuis la ville pour les zones proches) via le bouton « Observer » de `/action` — qui indique aussi le nombre de survivants présents dans chaque zone voisine, et coûte moins cher à l'éclaireur (voir document d'équilibrage §4) — ou quand un autre citoyen la lui partage
- Partage de la carte : réservé aux citoyens vivants présents en ville ; destinataires choisis parmi les citoyens vivants de la ville (un menu à choix multiples, ou « toute la ville »), où qu'ils soient ; chacun reçoit les zones qu'il ne connaissait pas ; le partage est annoncé sur la place publique et inscrit au journal des destinataires
- **Rendu de la carte** : image générée par le bot (SVG rastérisé par `@resvg/resvg-js`, police Courier Prime embarquée dans `assets/fonts`), dans une charte inspirée de la carte de MyHordes (écran radar vert olive quadrillé dans un cadre brun) : la ville au centre, un anneau par palier, les 4 types de zone en diagonale, en cases carrées ; zones inconnues en noir, position du joueur entourée d'un contour vert lumineux. Des points jaunes cerclés de rouge montrent les **concitoyens hors les murs** (vivants ou exclus) ; jamais les joueurs des autres villes, ni ceux restés en ville
- **Inventaire de ville** : dépôt d'objets sans passer par le troc direct (fait aussi office de banque)
- **Capacité de zone** : pas de limite artificielle de joueurs simultanés dans un même salon de territoire externe en V1

**Reporté en V2** : sort de la carte perso en cas de mort en territoire externe (perdue vs partagée automatiquement) ; possibilité de fausses informations dans une carte partagée.

### Multi-villes (activé dès la V1)

- Jusqu'à **3 villes max** partagent les mêmes territoires externes, regroupées en **groupes fixes**.
- À la fondation, la nouvelle ville rejoint un groupe existant ayant moins de 3 villes, sinon crée un nouveau groupe (nouveaux salons de territoires externes + nouveaux rôles de zone si besoin).
- **Le groupe reste figé une fois formé** : si une ville du groupe tombe, sa place ne se libère pas — aucune nouvelle ville ne rejoint ce groupe après coup, même redescendu à 1 ou 2 villes actives.
- Un joueur peut changer de ville : vote dans la ville accueillante après qu'un candidat croisé en territoire externe ait été rapporté ; même système de vote que l'élection du maire.
- **Chute d'une ville** : déclenchée par la mort de son dernier habitant vivant, quelle qu'en soit la cause (attaque nocturne, combat en territoire externe, faim, soif, infection) — fin de partie pour cette ville, récapitulatif posté dans `commémoration`. **Tous ses joueurs la quittent automatiquement** (rôle-ville, Citoyen et Mort retirés, retour au rôle Nomade) et peuvent rejoindre une autre ville. Ses salons et son rôle-ville restent en place (sans membres) tant que d'autres villes du groupe sont en jeu.
- **Chute de la dernière ville d'un groupe** : suppression de tout ce qui appartient au groupe — rôles-ville, catégories Ville et leurs salons, catégorie "Territoires externes", salons de zone et rôles Position du groupe.

---

## 2. Points d'action & cycle jour/nuit

- Se rendre en territoire externe coûte des PA, variable selon la distance
- PA régénérés à **paliers fixes** (plutôt que progressif dans le temps), notamment par le sommeil
- Cycle fixé à **48h réelles** : 24h de jour puis 24h de nuit
- Attaque de zombies à **minuit du second jour réel**
- **Horloge commune à minuit** : les passages jour/nuit ont lieu à minuit, à la même horloge réelle pour toutes les villes actives, plutôt que 24h/48h après la fondation de chacune. Une ville fondée en cours de journée a donc un **premier cycle plus court** (jusqu'au minuit suivant). L'attaque de zombies se résout **à l'aube, en clôture de la nuit** (transition nuit → jour), jamais à la tombée de la nuit : le minuit qui clôture une journée n'a donc jamais d'attaque, à chaque cycle et pour toutes les villes — y compris pour le tout premier cycle (plus court) d'une ville qui vient d'être fondée, sans qu'il faille de règle spéciale supplémentaire. La toute première nuit d'une ville subit en revanche une attaque normale à la force du cycle 1, comme toutes les nuits suivantes (section 3 du document d'équilibrage).
- La nuit : rencontres aléatoires différentes et plus dangereuses, déplacements plus coûteux en PA (moins de visibilité)
- **Notifications de cycle** : ping automatique dans un salon de ville au passage jour/nuit et à l'approche de l'attaque de zombies
- Temps restant avant jour/nuit affiché dans `/personnage`

---

## 3. Progression du personnage

### Identité du personnage
- Le joueur joue sous son **pseudo Discord**, pas de nom de personnage distinct

### Compétences & talents
- Petit arbre de compétences : talents **généraux** (accessibles à tous, ex. endurance, force) et talents **spécifiques aux métiers**
- V1 : arbre léger, upgrade automatique de compétences au passage de paliers d'XP (pas de choix à embranchements)
- XP générale (non spécifique au métier) en V1 ; XP par métier envisagée en V2 (crainte de lourdeur)

### Métiers
Garde, médecin, artisan, éclaireur, guetteur, cuisinier, fossoyeur, ingénieur/bâtisseur, chasseur/trappeur, diplomate/marchand.

- Choix définitif à la création du personnage, places limitées par métier (premier arrivé, premier servi)
- Métier complet → non sélectionnable (grisé dans le menu), le joueur choisit un autre métier ou reste "sans métier"
- **Chiffrage des places (V1/bêta, sur 15 joueurs max par ville)** — approche par places fixes, indépendantes de la taille de la ville, cohérente avec le choix définitif à la création :

| Métier | Places |
|---|---|
| Garde | 2 |
| Médecin | 1 |
| Artisan | 2 |
| Éclaireur | 2 |
| Guetteur | 1 |
| Cuisinier | 1 |
| Fossoyeur | 1 |
| Ingénieur/bâtisseur | 1 |
| Chasseur/trappeur | 1 |
| Diplomate/marchand | 1 |
| **Total métiers** | **13** |
| **Sans métier** | **2 places restantes** |

### Points de vie, blessures & infection
- Chaque joueur a **10 PV**, consultables dans `/personnage`. Les PV perdus représentent les blessures : chaque PV manquant réduit le **PA max** (pas de malus séparé ; chiffres dans le document d'équilibrage)
- Perte de PV : attaque nocturne en défense insuffisante (aléatoire, la maison privée réduit la chance d'être touché), faim ou soif critique/vide (perte progressive à chaque phase), combat raté en territoire externe (gameplay de combat à définir, avec en plus un risque d'infection)
- Soin basique : réalisable par n'importe quel joueur, rend des PV
- Soin avancé : réservé au métier médecin, rend plus de PV
- À 0 PV ou moins, le joueur meurt (voir Mort)

**Infection** :
- Déclenchement caché — seul le joueur infecté le sait, libre d'en parler ou non
- **Déclencheur** : un "coup reçu" donne 10 % de chance d'infection à chaque occurrence — en rencontre externe uniquement si le joueur combat (jamais en cas de fuite), ou via le jet de risque de l'attaque de nuit si le citoyen est "touché" par une défense insuffisante (formule chiffrée dans le document d'équilibrage)
- Incubation : **2 cycles jour/nuit (96h)** avant transformation en zombie
- Pendant l'incubation : malus en PA progressif de façon **linéaire continue** (de 0 % à −30 % du PA max sur les 96h, voir document d'équilibrage) + symptômes visibles par les autres qui s'aggravent avec le temps
- Guérison : remède fabriqué par le médecin, avec des ingrédients trouvables uniquement en territoire externe (loot rare)
- Non soigné à temps → le joueur devient zombie et s'ajoute à l'attaque de la nuit suivante

### Mort
- Statut **post-mortem jouable** : le joueur mort devient une âme avec une influence légère sur la partie en cours (pas un simple spectateur passif)
- Le joueur mort voit toujours sa ville (rôle Mort à la place de Citoyen) mais ne peut plus y interagir : écriture, réactions et vocal lui sont retirés sur les salons de la ville
- Depuis `/action`, il peut **quitter la ville** (confirmation obligatoire) : suppression de son rôle-ville et de ses rôles Citoyen/Mort, retour au rôle Nomade, perte de l'accès aux salons ; il peut alors rejoindre ou créer une **autre** ville avec un nouveau personnage. Tant qu'il ne l'a pas quittée, il reste engagé dans cette partie
- **Objets à la mort** : les objets d'inventaire du joueur (dont une radio s'il en avait) deviennent **lootables sur place** par les autres joueurs présents dans la zone/ville

### Cycle de vie du joueur (hors mort)
- `/quitter-ville` : sortie volontaire — libère le rôle Position/Citoyen et la place de métier ; le joueur ne peut plus rejoindre cette ville
- Joueur qui quitte le serveur Discord (pas le jeu) : traité comme une exclusion technique automatique (nettoyage des rôles), pas compté comme une mort dans les stats
- Inactivité prolongée : rien d'automatisé en V1, gérée manuellement par les admins (via les commandes admin existantes)
- Nouveaux arrivants une fois une ville lancée : aucune option sauf attendre une ville en cours de recrutement ailleurs (pas de recrutement continu en V1)
- **Détection multi-compte** : rien de prévu en V1, pas de solution technique — vigilance communautaire/admin en cas de soupçon

### Méta-progression
- **Titres/succès persistants** entre parties, indépendants de la ville en cours — validé

**Reporté en V2** : actions héroïques (actions rares à fort risque/forte récompense), escorte (accompagner un joueur faible/nouveau en zone dangereuse — à voir si couvert par les expéditions de groupe).

---

## 4. Interface & commandes

Principe directeur : maximiser les interactions via **components Discord V2** (boutons, menus déroulants) plutôt que des commandes à taper/retenir.

### Commandes de jeu
- `/action` : menu des actions possibles (Components V2) ; pour un joueur mort, bouton « Quitter la ville » — pour un joueur vivant, actions selon la zone courante (à venir) : inclut les boutons "aller" (avec confirmation avant de dépenser des PA), "observer", "carte" (image de sa carte des zones découvertes) et "partager la carte" (en ville uniquement) ; en cas de rencontre, inclut aussi les boutons de combat/interaction (attaquer/fuir/parler-troquer)
- `/inventaire` : affichage + troc (bouton "donner à" → sélection joueur → sélection objet) + craft simple avec ce qu'on a sur soi
- `/personnage` : stats du perso (PV, PA restant et PA max effectif, métier, etc.), temps restant avant jour/nuit, historique des dernières actions
- `/aide` : liste contextuelle des commandes disponibles selon le salon/l'état du joueur
- `/quitter-ville` : sortie volontaire de la ville (voir section 3)
- `/signaler` : signale un comportement problématique, envoie un message dans le salon Admin-MJ dédié aux signalements
- **Initialiser le serveur** (bouton du panneau `/admin`) : paramètre tout le Discord (salons, rôles, permissions) ; approche par **diff** entre état souhaité (config en base) et état réel du serveur, pour ne pas casser les salons "maison" ou les positions courantes en territoire externe — permet aussi une mise à jour simple, pas seulement une création initiale ; prévoit notamment la création de la catégorie "Disc'Hordes" (salons, dans cet ordre : `général`, `annonces`, `règles`, `fonder-une-colonie`, `nouvel-arrivant` et `commémoration`), du salon de signalements, du salon `discussion-mj` et du salon `gestion`

### Onboarding
- **Message de bienvenue au niveau du serveur** Discord (avant même de rejoindre une ville) : explique le concept et redirige vers `fonder-une-colonie`
- **Message d'accueil** posté au joueur au moment où il rejoint effectivement une ville, à sa fondation : résume les bases (PA, faim/soif, `/action`, `/aide`)

### Commandes pré-jeu (salon dédié "fonder-une-colonie", catégorie "Disc'Hordes", créé à l'initialisation du serveur)
- `/creer-ville` : seule commande pré-jeu, sans paramètre. Ouvre un formulaire unique : **nom de la ville** (50 caractères max), **métier du créateur** (liste déroulante, dont "simple citoyen") et **projet de ville** facultatif (1000 caractères max). Poste dans `fonder-une-colonie` un **message de ville** (Components V2) : nom, créateur, projet, liste des inscrits avec leur métier (mise à jour à chaque arrivée/départ), et quatre boutons :
  - **Rejoindre la ville** (tout utilisateur non engagé dans une ville ni ayant une demande en attente) : choix du métier (seuls les métiers encore libres sont proposés) ou "simple citoyen", puis formulaire facultatif de **motivations** (1000 caractères max) ; la demande est postée dans le salon `nouvel-arrivant` en mentionnant le créateur de la ville et le joueur (avec métier choisi et motivations), avec des boutons Accepter/Refuser réservés au créateur — pas d'inscription à la volée ; pas de délai automatique de réponse en V1
  - **Quitter la ville** (inscrits, hors créateur) : quitte la ville avant sa fondation, ou retire sa demande en attente pour la déposer ailleurs
  - **Fonder la ville** (créateur) : lance le jeu — création de la catégorie au nom de la ville puis des salons, accessibles aux membres ayant rejoint ; création du rôle-ville et rattachement à un groupe de territoires externes (existant ou nouveau, voir section 1), dont la catégorie et les 12 salons de zone sont créés s'ils n'existent pas encore ; le créateur devient automatiquement le premier maire (mandat de 4 cycles, destituable ensuite comme n'importe quel maire) ; **minimum de 3 habitants** pour lancer (voir document d'équilibrage), sauf si le créateur a le rôle MJ ou Admin, qui peut fonder avec moins (y compris seul, pour les tests) ; on ne peut plus rejoindre une ville après lancement, sauf déménagement depuis une autre ville en jeu ; les demandes encore en attente sont refusées, et le message de ville ainsi que les demandes postées dans `nouvel-arrivant` sont supprimés
  - **Annuler la ville** (créateur, ou MJ/Admin) : après confirmation, supprime la ville, ses inscriptions, ses demandes et leurs messages. Aucun rôle n'est attribué avant la fondation, il n'y a donc rien à retirer aux inscrits
- Nombre de joueurs max par ville : **15** (évolutif)

### Commandes admin
- `/moderation` (MJ et Admins) : ouvre un panneau de modération (Components V2, éphémère) dont chaque action est un bouton ; les droits sont revérifiés à chaque clic. Actions disponibles :
  - **Publier les règles** : republie les règles joueurs dans le salon `règles` — supprime les anciens messages et fils du bot dans ce salon puis poste un sommaire (embed dont chaque titre est un lien vers le message de la section) suivi d'une **image par section** de `docs/regles-joueurs.md` (une section par titre « # », rendue par satori + resvg dans la charte MyHordes, emojis Twemoji), avec sous chaque image les liens vers les salons cités ; un **fil verrouillé** sous le sommaire contient le texte brut de toutes les sections (recherche, copie, liens de salons)
- Effacer une ville en cours de création (accessible au créateur de la ville et aux admins)
- `/admin` (Admins uniquement) : ouvre un panneau d'administration (Components V2, éphémère). L'accueil propose un bouton par **famille d'actions** ; chaque bouton remplace le panneau par le sous-panneau de la famille (un bouton par action, bouton « Retour » vers l'accueil). Les droits sont revérifiés à chaque clic. Chaque action est inscrite au **journal des actions admin** (table dédiée, séparée des logs techniques).
- **Format retenu** : une seule commande `/admin`, les familles et actions étant des boutons (pas de commande par famille). Ciblage via **menu déroulant** dans un formulaire (ville, membre du serveur, objet, métier, durée), jamais de nom à taper ; seules les valeurs (nouveau nom, quantité, jauges, nombre de cycles) sont saisies en texte. **Confirmation obligatoire** (bouton) avant toute action destructive (réinitialiser la base, effacer une ville, forcer la chute, reset, kick).

| Famille | Actions |
|---|---|
| Serveur | **Initialiser le serveur** (voir plus haut) ; **Réinitialiser la base** ⚠ : efface toutes les parties — villes (en création, en jeu, tombées), joueurs, demandes, groupes et territoires — ainsi que leurs salons et rôles Discord (catégories Ville, Territoires externes, rôles-ville et Position), retire Citoyen et Mort et rend le rôle Nomade à tous ; conserve le catalogue (objets, recettes, succès), la structure posée par l'initialisation et le journal admin ; la confirmation propose « Effacer les parties » (comptes joueurs et succès obtenus conservés) ou « Effacer aussi les comptes » |
| Ville | **Effacer** ⚠ (ville de tout statut, ses personnages, salons et rôles, sans récapitulatif ; les joueurs encore dedans redeviennent Nomades ; nettoyage du groupe s'il n'a plus de ville en jeu), **Renommer** (base, rôle-ville, catégorie et vocal, ou message de recrutement), **Forcer la fondation** (sans minimum d'habitants, le créateur devient maire), **Forcer la chute** ⚠ (comme une chute normale : récapitulatif dans `commémoration`, départ des joueurs), **Reset** ⚠ (la ville repart au cycle 1, jour, avec ses habitants actuels tous vivants, pleine santé, faim/soif 100, PA au max, en ville ; inventaires, cartes, bâtiments, banque, élections et historique d'attaques effacés ; maire conservé) |
| Joueur | **Téléporter** (zone du groupe ou retour en ville, rôles Position mis à jour, zone ajoutée à la carte), **Ressusciter** (mort ou zombifié → vivant, pleine santé, sans infection), **Guérir** (PV au max, infection retirée), **Infecter** (infection cachée), **Exclure de force** (statut exclu : plus d'accès aux salons de la ville, rôle-ville conservé pour les territoires externes ; perd la mairie s'il était maire), **Réintégrer de force**, **Changer de métier** (avant ou après la fondation, places par métier dépassables avec avertissement) |
| Ressources | **Ajouter/Retirer objet (joueur)**, **Ajouter/Retirer objet (ville)** (banque de ville), **Ajuster faim/soif/PA** (un seul formulaire ; valeur fixe « 80 » ou relative « +20 »/« -10 », vide = inchangé ; faim/soif bornées 0-100, PA bornés au PA max effectif) |
| Temps | **Forcer passage jour/nuit** (même traitement qu'à minuit, attaque à l'aube comprise), **Déclencher attaque de zombies** (force du cycle courant, sans changer de phase ni de cycle, hors historique des attaques), **Avancer le cycle**, **Reculer le cycle** (de 1 par défaut, minimum cycle 1) |
| Politique | **Forcer une élection** (grisé tant que les élections ne sont pas en jeu), **Destituer le maire de force** (la ville reste sans maire), **Changer le maire directement** (citoyen vivant, nouveau mandat de 4 cycles à partir du cycle courant) ; annonces dans la mairie |
| Modération | **Mute joueur** (exclusion temporaire Discord de 10 min à 7 jours, ou levée), **Kick joueur (jeu)** ⚠ (retire le joueur de sa ville sans l'exclure du serveur ; la ville tombe s'il en était le dernier vivant), **Consulter logs d'actions admin** (20 dernières actions) |

---

## 5. Vie de ville

### Vote & politique
Deux types de votes distincts :
- **Décisions de ville** (priorisation d'un chantier, exclusion d'un joueur, rationnement) : tranchées directement par le maire, pas de vote citoyen
- **Élection du maire** : déclenchable par n'importe quel joueur ; bouton pour s'inscrire comme postulant ; vote lancé 24h IRL après déclenchement

Règles :
- Mandat du maire : **4 cycles jour/nuit**
- Majorité simple entre postulants ; égalité → départage par le postulant avec le plus d'XP ; toujours égalité → revote entre les deux
- Seuls les citoyens présents en ville votent
- Le maire peut être destitué par un **vote de défiance** : même mécanique que l'élection (24h après déclenchement) mais choix "maintenir/destituer" à majorité simple parmi les citoyens présents ; le maire destitué peut se représenter ensuite
- Pouvoir d'exclusion du maire : le joueur exclu perd l'accès à la ville mais continue d'exister en territoire externe (troc, vol, attaque) ; réhabilitable par vote de la communauté
- Décisions du maire communiquées à la voix, pas de component dédié ; prévoir un "panneau" de rappel affiché lors d'une décision
- **Rationnement** : le maire peut limiter l'eau/nourriture de ville si les stocks baissent (décision directe, comme les autres décisions de ville)

### Chantiers & bâtiments
- Chantiers communautaires : contribution libre, avec directives de priorité du maire (source de tension si non respectées)
- Chaque joueur peut aussi upgrader sa maison personnelle, indépendamment
- **Bâtiments à paliers** : amélioration par contribution libre comme les chantiers actuels ; **coût de contribution croissant à chaque palier**, pour tous les bâtiments à paliers multiples

| Bâtiment | Paliers | Effet |
|---|---|---|
| **Palissade/Fortifications** | 6 à 8 paliers dédiés | Bonus de défense de nuit croissant à chaque palier (courbe exacte à chiffrer en équilibrage) |
| **Atelier** | 2 | P1 : débloque le craft avancé de base, dont la réparation voiture ; P2 : débloque des recettes avancées supplémentaires |
| **Puits** | 2 | P2 : capacité d'eau de ville accrue / conso de soif réduite |
| **Place publique** | 2 | Sert de stockage pour l'inventaire/banque de ville ; P2 : capacité accrue |
| **Maison privée** (perso) | 2 | P2 : PA max légèrement accru |
| **Mairie** | 1 seul | Pas d'upgrade, bâtiment purement fonctionnel (élections, décisions, rationnement) |

### Défense de nuit
- Défense totale = bonus des chantiers construits + bonus par garde assigné cette nuit-là
- Tout citoyen peut se porter volontaire pour monter la garde (bonus plus élevé pour le métier garde)
- Se porter volontaire coûte des PA/du repos
- Défense insuffisante → dégâts sur les chantiers ET perte de PV aléatoire parmi les citoyens en ville (chance d'être touché et PV perdus proportionnels au ratio déficit/attaque, chance réduite par la maison privée — chiffrés dans le document d'équilibrage) ; la mort n'arrive qu'à 0 PV

---

## 6. Survie & ressources

- **Faim et soif** : deux jauges séparées ; alerte sous seuil critique ; malus en PA et restriction de certaines actions (ex. pas de construction) en dessous du seuil ; consommation directement dans les ressources de ville si en ville, dans l'inventaire perso si en sortie
- **Fatigue en territoire externe** : coût en PA en V1 ; jauge de fatigue séparée envisagée en V2
- **Régénération des points d'intérêt** : pas de régénération sur les produits transformés (loot fini/fabriqué) ; régénération uniquement sur les ressources naturelles (bois, baies, animaux à chasser), avec un stock max désormais chiffré par palier de zone (proche/moyenne/éloignée) dans le document d'équilibrage
- **Économie/monnaie** : jugée trop lourde pour la V1, reportée en V2 (avec l'idée d'un commerce avec des villes extérieures)

### Crafting
- **Craft simple** dans `/inventaire` : 4 recettes de base pour la V1 — petit bandage, petit plat préparé, feu, petite arme — ouvertes à tous. Consomment des **ingrédients d'inventaire** (bois, tissu, objets trouvés en zone), pas juste un coût en PA. Liste évolutive : d'autres recettes pourront être ajoutées selon les retours de la bêta.
- **Craft avancé** : accessible seulement en ville avec l'atelier construit, recettes plus coûteuses en PA. Une recette avancée **exclusive par métier** :

| Métier | Recette avancée exclusive |
|---|---|
| Médecin | Remède contre l'infection |
| Ingénieur/bâtisseur | Réparation voiture (dès le palier 1 de l'atelier) + structures de défense avancées |
| Cuisinier | Plats avancés (plus nourrissants / effets bonus) |
| Chasseur/trappeur | Pièges avancés |
| Artisan | Armes/outils avancés |

  Les autres métiers (garde, guetteur, fossoyeur, diplomate/marchand, éclaireur) n'ont pas de recette avancée exclusive en V1 — leur spécialisation passe par les talents/compétences.

### Exploration
- Danger par zone : zones adjacentes à la ville moins dangereuses mais moins de ressources ; zones éloignées plus dangereuses mais plus de ressources ; certaines rencontres communes à toutes les zones (zombies, humains gentils ou méchants)
- Expéditions de groupe : plusieurs joueurs dans la même zone peuvent s'entraider en cas de combat
- Idée de **voiture** utilisable pour réduire le coût en PA d'un déplacement à plusieurs joueurs
- **Météo dynamique** : impacte le coût en PA des déplacements, inflige des dégâts sur les chantiers, augmente le risque d'attaques de zombies (approche inaudible par mauvais temps)

---

## 7. Narration & IA locale

- IA gérée en local, en surcouche du jeu
- Génère des événements aléatoires en ville (incendie, tempête, attaque de bandits, nourriture contaminée, etc.)
- Gère les rencontres en territoire externe : monstres à combattre, mais aussi humains avec qui parler, échanger, commercer ou se battre via des discussions en temps réel
  - **V0.1** : stub simplifié, zombie uniquement, probabilité liée au palier de zone (10/20/35 % proche/moyenne/éloignée, ×1,5 la nuit) — rencontres humaines/bandits et table complète de dangerosité reportées à la bêta, confirmé hors scope V1 ; valeurs stub détaillées dans le document d'équilibrage
- Journal de bord automatique posté par le bot ; réflexion sur un appui IA pour raconter de petits événements narrés du point de vue des gardes ou des joueurs bloqués dehors
- Flux public dans le journal de bord pour les actions en ville ; rien de public pour le territoire externe — les joueurs doivent raconter eux-mêmes ; un joueur doit prévenir de sa zone s'il pourrait avoir besoin d'être rapatrié ; prévoir une fusée de détresse pour indiquer sa zone sinon
- Scénarios narratifs : événements aléatoires en V1, avec possibilité d'un petit arbre de mini-quête proposé par un PNJ extérieur ; scénarios complexes reportés en V2

### Trahison
- Un joueur peut troquer avec des bandits (considéré comme du vol), visible seulement par les joueurs présents dans la zone
- Peut aussi troquer des infos — côté bandits : découvertes de zones/points d'intérêt ; côté joueur trahi : infos sur la ville qui augmentent la puissance d'attaque des zombies la nuit
- Indépendante du statut Infecté
- Capture de bandit possible la nuit ; un bandit capturé "vend la mèche" dans le récap IA de la nuit

---

## 8. Fin de partie

- Format infini/survie : pas de durée fixe, l'objectif est de tenir le plus longtemps possible
- La ville tombe à la mort de son dernier habitant vivant — en pratique surtout quand les attaques de zombies deviennent trop fortes chaque nuit (augmentation progressive) ; reset possible, utile en V1 pendant l'équilibrage
- Stats de fin de partie postées dans le salon `commémoration` (catégorie "Disc'Hordes") : dates de fondation et de chute, nuits survécues, dernier maire, plus forte attaque subie, dernier survivant, et liste des habitants avec métier et cause de mort ; si c'était la dernière ville de son groupe, déclenche aussi la suppression des rôles et salons du groupe (voir section 1)
- Classement entre villes (nommées par les joueurs), classées par nombre de cycles tenus ; historique des joueurs ayant fait partie des villes visitées
- Scénarios avec objectifs et gestion narrative par IA envisagés en V2, le temps de tester les fonctionnalités de base

---

## 9. Infrastructure

- Hébergement chez **TeoHeberg** (hébergeur gratuit de bots Discord Node.js/Python), où Horror Botum Est est déjà hébergé
- Disc'Hordes tournera comme un second bot dédié séparé
- Abonnement à 1€/mois déjà payé, avec accès à une base MySQL
- Gestion des fichiers via FTP

**Contraintes techniques notées pour l'implémentation** (pas des décisions de conception, à traiter lors de la conversation dédiée TeoHeberg) :
- Timer de cycle stocké en base pour survivre à un redémarrage du bot
- Logs techniques séparés des logs d'action admin
- Cooldown court entre deux utilisations de `/action` (anti-spam)
- Le reset admin déjà prévu suffit en V1 ; pas de système de rollback ciblé en plus

*Une conversation technique dédiée est prévue sur TeoHeberg (déploiement, architecture du bot).*
