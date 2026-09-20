# Disc'Hordes — Document de conception (V1 bêta, cadrage complet)

Jeu Discord de survie zombie inspiré de *Hordes/MyHordes*, envisagé comme module de **Horror Botum Est**. Inspiré du concept, pas un clone à l'identique.

> **Mise à jour** : déclenchement de l'infection formalisé, sévérité du risque de défense/nuit renvoyée au document d'équilibrage, stub v0.1 pour les rencontres en territoire externe ; points d'équilibrage de la section 10 du document d'équilibrage tranchés (croissance de l'attaque, loot rare, malus infection, stock de ressources naturelles) — voir document d'équilibrage pour le détail.

---

## 1. Structure Discord

**Catégorie "Ville"** : mairie, place publique, chantiers, atelier, puits, maisons privées, **un salon vocal général lié au rôle-ville**.
**Catégorie "Territoires externes"** : un salon par zone (ville en ruines, forêt, marécages, montagnes, etc.) — **partagée entre les villes d'un même groupe** (voir section Multi-villes ci-dessous). Pas de vocal par zone.
**Catégorie "Admin-MJ"**, incluant un salon règles créé automatiquement par `/init` et un salon de signalements (voir section 4).

**Rôles** :
- **Citoyen** : appartenance générale à une ville.
- **Rôle-ville** (créé à `/fonder-ville`, un par ville) : donne la visibilité de la catégorie "Territoires externes" du groupe auquel la ville appartient, et la visibilité/écriture de base dans sa propre catégorie Ville.
- **Position:<zone>** (ex. Position:Forêt) : rôle **global**, pas dupliqué par ville ni par groupe — donne le droit d'écrire dans le salon de la zone précise (overwrite au niveau salon, qui prime sur la visibilité de catégorie donnée par le rôle-ville). Comme les rôles de zone sont globaux mais que la visibilité de catégorie est filtrée par rôle-ville, il n'y a pas de fuite entre groupes malgré ce partage — et le nombre de rôles ne scale ni avec le nombre de villes ni avec le nombre de groupes.
- **Radio** : géré automatiquement par le bot selon la possession de l'objet radio en inventaire (ajout/retrait synchronisé, pas de commande d'activation). Permet de garder le droit d'écrire dans les salons de Ville même en étant positionné en territoire externe (normalement perdu en partant).
- **Infecté**, **Mort**, **MJ/Admin**.

- Se déplacer entre zones = changement de rôle Discord (accès/retrait de salon)
- Déplacement par **adjacence** : on traverse les zones intermédiaires plutôt que de sauter directement, pour permettre des événements en chemin et complexifier l'accès aux zones éloignées
- Trajet joué zone par zone, une commande par étape (pas de trajet multi-zones simulé d'un coup)
- Dans une nouvelle zone, le joueur voit les zones adjacentes accessibles depuis là → un éclaireur peut constituer une "carte"
- Découverte de zones individuelle ; commande `/partager-carte` pour la transmettre aux autres en rentrant d'une zone ; commande `/carte` pour consulter sa propre carte découverte à tout moment
- **Inventaire de ville** : dépôt d'objets sans passer par le troc direct (fait aussi office de banque)
- **Capacité de zone** : pas de limite artificielle de joueurs simultanés dans un même salon de territoire externe en V1

**Reporté en V2** : sort de la carte perso en cas de mort en territoire externe (perdue vs partagée automatiquement) ; possibilité de fausses informations dans une carte partagée.

### Multi-villes (activé dès la V1)

- Jusqu'à **3 villes max** partagent les mêmes territoires externes, regroupées en **groupes fixes**.
- À `/fonder-ville`, la nouvelle ville rejoint un groupe existant ayant moins de 3 villes, sinon crée un nouveau groupe (nouveaux salons de territoires externes + nouveaux rôles de zone si besoin).
- **Le groupe reste figé une fois formé** : si une ville du groupe tombe, sa place ne se libère pas — aucune nouvelle ville ne rejoint ce groupe après coup, même redescendu à 1 ou 2 villes actives.
- Un joueur peut changer de ville : vote dans la ville accueillante après qu'un candidat croisé en territoire externe ait été rapporté ; même système de vote que l'élection du maire.
- **Chute d'une ville** : fin de partie pour cette ville — affichage des stats de fin de partie **et** nettoyage de son rôle-ville et de tout ce qui en dépend.

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

### Blessures & infection
- Soin basique : réalisable par n'importe quel joueur
- Soin avancé : réservé au métier médecin
- Blessures : réduisent le **PA max** jusqu'à guérison (pas de malus séparé)

**Infection** :
- Déclenchement caché — seul le joueur infecté le sait, libre d'en parler ou non
- **Déclencheur** : un "coup reçu" donne 10 % de chance d'infection à chaque occurrence — en rencontre externe uniquement si le joueur combat (jamais en cas de fuite), ou via le jet de risque de l'attaque de nuit si le citoyen est "touché" par une défense insuffisante (formule chiffrée dans le document d'équilibrage)
- Incubation : **2 cycles jour/nuit (96h)** avant transformation en zombie
- Pendant l'incubation : malus en PA progressif de façon **linéaire continue** (de 0 % à −30 % du PA max sur les 96h, voir document d'équilibrage) + symptômes visibles par les autres qui s'aggravent avec le temps
- Guérison : remède fabriqué par le médecin, avec des ingrédients trouvables uniquement en territoire externe (loot rare)
- Non soigné à temps → le joueur devient zombie et s'ajoute à l'attaque de la nuit suivante

### Mort
- Statut **post-mortem jouable** : le joueur mort devient une âme avec une influence légère sur la partie en cours (pas un simple spectateur passif)
- Le joueur mort (âme) reste bloqué dans cette partie jusqu'à la chute de la ville, mais peut rejoindre une **autre** ville en cours de création avec un nouveau personnage
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
- `/action` : menu des actions possibles selon la zone courante — inclut les boutons "aller" (avec confirmation avant de dépenser des PA) et "observer" ; en cas de rencontre, inclut aussi les boutons de combat/interaction (attaquer/fuir/parler-troquer)
- `/inventaire` : affichage + troc (bouton "donner à" → sélection joueur → sélection objet) + craft simple avec ce qu'on a sur soi
- `/personnage` : stats du perso (PA restant, métier, blessures, etc.), temps restant avant jour/nuit, historique des dernières actions
- `/partager-carte` : transmet sa carte de zones découvertes aux autres
- `/carte` : consulte sa propre carte de zones découvertes
- `/aide` : liste contextuelle des commandes disponibles selon le salon/l'état du joueur
- `/quitter-ville` : sortie volontaire de la ville (voir section 3)
- `/signaler` : signale un comportement problématique, envoie un message dans le salon Admin-MJ dédié aux signalements
- `/init` : paramètre tout le Discord (salons, rôles, permissions) ; approche par **diff** entre état souhaité (config en base) et état réel du serveur, pour ne pas casser les salons "maison" ou les positions courantes en territoire externe — permet aussi une mise à jour simple, pas seulement une création initiale ; prévoit notamment la création du salon `fonder-une-colonie`, du salon règles, et du salon de signalements

### Onboarding
- **Message de bienvenue au niveau du serveur** Discord (avant même de rejoindre une ville) : explique le concept et redirige vers `fonder-une-colonie`
- **Message d'accueil** posté au joueur au moment où il rejoint effectivement une ville via `/fonder-ville` : résume les bases (PA, faim/soif, `/action`, `/aide`)

### Commandes pré-jeu (salon dédié "fonder-une-colonie", créé via `/init`)
- `/creer-ville` : création d'une ville, paramètre = nom de la ville
- `/rejoindre` : liste sélectionnable des villes en cours de création ; le joueur choisit un métier (grisé si complet) ou "simple citoyen" ; envoie une demande au créateur de la ville sur le salon (avec user et métier choisi) pour validation manuelle — pas d'inscription à la volée, le créateur peut refuser ; pas de délai automatique de réponse en V1, le joueur peut annuler sa demande pour la déposer ailleurs
- `/fonder-ville` : réservée au créateur de la ville, lance le jeu — création de la catégorie au nom de la ville puis des salons, accessibles aux membres ayant rejoint ; création du rôle-ville et rattachement à un groupe de territoires externes (existant ou nouveau, voir section 1) ; le créateur devient automatiquement le premier maire (mandat de 4 cycles, destituable ensuite comme n'importe quel maire) ; pas de minimum de joueurs imposé pour lancer ; on ne peut plus rejoindre une ville après lancement, sauf déménagement depuis une autre ville en jeu ; une fois la ville fondée, ses messages de création/inscription sont supprimés/archivés du salon commun
- Nombre de joueurs max par ville : **15** (évolutif)

### Commandes admin
- Effacer une ville en cours de création (accessible au créateur de la ville et aux admins)
- **Format retenu** : une commande unique par famille, ouvrant une interface **Components V2** avec un bouton par action (plutôt que des commandes séparées par action). Ciblage (quel joueur/quelle ville/quel objet) via **menu déroulant** après le clic sur le bouton, jamais de champ texte à taper. **Confirmation obligatoire** (bouton) avant toute action destructive (effacer ville, forcer chute, reset).

| Commande | Boutons/actions |
|---|---|
| `/admin-ville` | Effacer, Renommer, Forcer la fondation, **Forcer la chute** ⚠, **Reset** ⚠ |
| `/admin-joueur` | Téléporter/changer de zone, Ressusciter, Guérir, Infecter, Exclure de force, Réintégrer de force, Changer de métier |
| `/admin-ressources` | Ajouter objet (joueur/ville), Retirer objet (joueur/ville), Ajuster faim, Ajuster soif, Ajuster PA |
| `/admin-temps` | Forcer passage jour/nuit, Déclencher attaque de zombies, Avancer le cycle, Reculer le cycle |
| `/admin-politique` | Forcer une élection, Destituer le maire de force, Changer le maire directement |
| `/admin-moderation` | Mute joueur (jeu), Kick joueur (jeu), Consulter logs d'actions admin |

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
- Défense insuffisante → dégâts sur les chantiers ET risque de blessure/mort aléatoire parmi les citoyens en ville (formule de sévérité — proportion blessure/mort — chiffrée dans le document d'équilibrage : elle réutilise le ratio déficit/attaque pour distinguer les deux issues)

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
- La ville tombe quand les attaques de zombies deviennent trop fortes chaque nuit (augmentation progressive) ; reset possible, utile en V1 pendant l'équilibrage
- Stats de fin de partie postées dans un salon dédié "Une Ville Tombe", avec récapitulatif détaillé ; déclenche aussi le nettoyage du rôle-ville et de tout ce qui en dépend
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
