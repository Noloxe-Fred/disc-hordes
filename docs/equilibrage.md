# Disc'Hordes — Document d'équilibrage V1 (bêta)

**Principe directeur** : difficulté élevée. Les marges sont volontairement serrées — une ville mal organisée doit pouvoir tomber en quelques cycles. Tous les chiffres ci-dessous sont un **point de départ chiffré et cohérent entre lui**, à recalibrer après les premières sessions de bêta.

Base de référence : ville de **15 joueurs max**, cycle de **48h réelles** (24h jour + 24h nuit), attaque de zombies à minuit du second jour.

> **Mise à jour** : décroissance faim/soif doublée, sévérité du jet de risque chiffrée, déclenchement de l'infection formalisé, stub v0.1 pour les rencontres en territoire externe, stock max des ressources naturelles chiffré par palier de zone ; **tous les points ouverts de la section 10 sont désormais tranchés** — malus PA de l'infection passé en linéaire continu, loot rare étendu à la zone moyenne, croissance de l'attaque/rythme d'installation/recettes cuisinier/stock de ressources naturelles validés tels quels, coût PA des 6 recettes avancées restantes chiffré. La table complète des rencontres humaines/bandits reste hors scope V1 (section 11) ; l'effet mécanique de certains objets de loot sans recette reste un point ouvert (section 12).

---

## 1. Points d'action (PA)

Changement de logique par rapport à une V0 à PA fixe unique pour tous : **le PA max individuel n'est plus une constante universelle, mais il reste fixe pour un joueur donné une fois attribué**. On fixe un budget total dont une ville a besoin par phase, ce budget est réparti à parts égales entre les habitants présents **au lancement de la ville** (bouton « Fonder la ville »), et cette valeur individuelle ne bouge plus ensuite pour la durée de la partie.

### Budget de ville — PA cible
- **PA cible par ville et par phase : 180.** Cette valeur représente ce qu'une ville a besoin de pouvoir produire collectivement pour fonctionner (chantiers, défense, exploration) — elle ne dépend pas du nombre d'habitants, c'est un paramètre de conception fixe (ajustable en admin plus tard si besoin).
- **PA max individuel = floor(180 ÷ nombre d'habitants présents au lancement de la ville)**, plafonné à **40 PA** pour éviter qu'une ville lancée très réduite (1 à 4 fondateurs) n'obtienne des PA individuels absurdes.
- **Minimum de 3 habitants pour lancer une ville** (bouton « Fonder la ville »). Exception : un créateur ayant le rôle MJ ou Admin peut fonder en dessous de ce minimum (villes de test) ; les lignes 1 et 2 du tableau ci-dessous ne concernent donc que ce cas.
- **Ce calcul n'a lieu qu'une seule fois, à la fondation de la ville.** Il n'est **jamais recalculé** ensuite, ni pour les morts, ni pour les départs (bouton « Quitter la ville » de `/action`, exclusion), ni pour les arrivées. La perte ou le gain d'habitants change la capacité collective réelle de la ville, mais ne modifie le PA max d'aucun joueur individuel déjà présent. **Seule exception : l'intégration forcée** d'un joueur par un Admin (bouton « Ajouter à une ville » du panneau `/admin`) dans une ville en jeu recalcule le PA max de la ville avec la même formule sur ses habitants vivants (exclus compris, nouveau venu inclus), et l'applique à **tous** ces habitants, y compris ceux arrivés par déménagement : PA actuels ramenés au nouveau maximum s'il baisse, nouveau venu à pleins PA.

| Habitants au lancement | PA max/joueur (floor(180/N), plafond 40) | PA collectif théorique au lancement |
|---|---|---|
| 1 | 40 (plafond, 180 sans plafond) | 40 |
| 2 | 40 (plafond, 90 sans plafond) | 80 |
| 3 | 40 (plafond, 60 sans plafond) | 120 |
| 4 | 40 (plafond, 45 sans plafond) | 160 |
| 5 | 36 | 180 |
| 7 | 25 | 175 |
| 10 | 18 | 180 |
| 12 | 15 | 180 |
| 15 (max) | 12 | 180 |

**Lecture** : le PA max individuel dépend uniquement de la taille de la ville **au moment où elle a été fondée**. Une ville lancée à 15 aura des citoyens à 12 PA pour toute la partie, même si elle retombe ensuite à 5 survivants (elle perd alors de la capacité collective réelle, sans que les survivants en soient individuellement compensés). Inversement, une ville lancée petite conserve des individus puissants même si elle grossit ensuite par déménagement. C'est ce budget de 180 (au format plein, N≥5) qui a servi de base à tous les coûts de chantiers de la section 7.

**Déménagement (rejoindre une ville en cours de recrutement, ou changement de ville en cours de partie, accepté par le maire de la ville d'accueil)** : contrairement à l'intégration forcée par un Admin (ci-dessus), le joueur garde le PA max qu'il avait déjà — jamais recalculé sur la base de la nouvelle ville. Un fondateur venu d'une ville de 15 (12 PA) qui rejoint ensuite une ville de 5 (36 PA) reste à 12 PA, et inversement. Ça crée volontairement une hétérogénéité durable entre citoyens d'une même ville selon leur ville d'origine.

### Modificateurs (exprimés en % du PA max individuel calculé ci-dessus, pas en valeur fixe — pour rester cohérents quel que soit le PA de base du joueur)
| État | Effet |
|---|---|
| Maison privée palier 2 | +15 % du PA max individuel (arrondi à l'inférieur) |
| Par PV manquant (voir « Points de vie » ci-dessous) | −5 % chacun (10 PV : 0 % ; 7 PV : −15 % ; 1 PV : −45 %) |
| Infection (progression linéaire continue depuis le déclenchement) | de 0 % à −30 % du PA max, sur toute la durée de l'incubation (96h) — soit environ −0,3125 % par heure écoulée depuis l'infection ; −30 % atteint juste avant la transformation en zombie |
| Faim ou soif (voir section 2) | Progressif dès que la jauge baisse : **−30 % × ((100 − jauge) / 100)²** par jauge (0 % à 100, −30 % à 0), puis −15 % de plus par phase supplémentaire passée à 0 |

**Cumul** : les modificateurs s'additionnent (en points de % du PA max individuel), puis le total est appliqué une seule fois, arrondi à l'inférieur et jamais sous 0. Exemple : PA max 20, 7 PV (−15 %) et faim à 50 (−7,5 %) → 20 × 0,775 = 15,5 → 15 PA max effectif.

### Points de vie (PV)
- Chaque joueur a **10 PV** (maximum, et valeur de départ).
- Les PV remplacent les anciennes « blessures légères » : il n'y a plus de blessure comptée à part ni d'hospitalisation, et **la mort n'arrive qu'à 0 PV ou moins**.
- **Pertes de PV** : attaque nocturne en défense insuffisante (section 3), faim et soif critiques ou vides (section 2), combat raté en territoire externe (montant à définir avec le gameplay de combat).
- **Soins** (bouton « Soigner » de `/action`, sur soi ou sur un survivant au même endroit : les citoyens présents en ville quand on est en ville, tout survivant de la même zone dehors) : soin basique **+2 PV** (ouvert à tous, consomme **1 Bandage**), soin avancé **+5 PV** (médecin uniquement, consomme au choix **1 Médicament basique** ou **1 Bandage + 1 Plante médicinale**), sans jamais dépasser 10. Coûts en PA : section 4. Soigner quelqu'un d'autre est annoncé dans le salon du lieu.
- **Mort** : le joueur voit toujours sa ville mais ne peut plus y agir ; il peut la quitter depuis `/action` pour rejoindre une autre ville. La mort du dernier habitant vivant fait tomber la ville.
- **Corps et sac du mort** : le sac du mort (radio comprise) reste sur son corps, là où il est tombé : en ville ou dans sa zone (un joueur transformé en zombie laisse son corps là où il s'est transformé). Tout survivant présent au même endroit peut le **fouiller** (bouton « Fouiller un corps » de `/action`, à côté de « Fouiller », visible seulement s'il y a un corps avec des objets) : en ville, les corps des citoyens de sa ville morts en ville ; dehors, tous les corps de la zone, quelle que soit leur ville. **Gratuit en PA**, un objet et une quantité à la fois, dans la limite de la charge du sac ; impossible pendant un combat. La fouille est inscrite au journal (public en ville) et annoncée dans le salon du lieu. Le corps reste fouillable même si le mort a quitté sa ville ; le reset d'une ville vide aussi les corps de ses anciens habitants.

### Déclenchement de l'infection
Une infection se déclenche via un **"coup reçu"**, avec **10 % de chance** à chaque occurrence :
- **En rencontre externe** : uniquement si le joueur choisit de combattre — aucune infection possible en cas de fuite (réussie ou non).
- **En attaque de nuit** : si le citoyen est l'une des victimes de la défense insuffisante (voir section 3), ce contact compte aussi comme un coup reçu.
- **En combat raté** en territoire externe : en plus de la perte de PV.

Une fois déclenchée, l'infection est cachée (seul le joueur le sait) et suit l'incubation de 2 cycles jour/nuit (96h) avec le malus PA linéaire ci-dessus.

### Transformation en zombie (fin de l'incubation)
Vérifiée toutes les 5 minutes. Le joueur **meurt** (statut Zombifié, cause « transformé en zombie », rôle Mort ; la mairie l'annonce) et son **zombie reste là où il s'est transformé** :
- **En ville** : zombie de **2 PV** (comme en zone proche). Il se jette **par surprise sur un citoyen présent en ville, tiré au hasard** : **−1 PV immédiat** (coup reçu, 10 % d'infection), puis combat normal (section 5). L'écran de combat précise qu'il s'agit du citoyen transformé. Si la victime **fuit**, il se jette sur un **autre citoyen présent en ville** (le même s'il est seul). **Aucune influence sur l'attaque de nuit.**
- **Dehors** : zombie aux **PV de la zone**, qui reste dans la zone (le lieu n'est pas annoncé). Il se jette de la même façon (−1 PV de surprise) sur un survivant présent, ou sur **le premier qui arrive**. Si sa victime fuit, il reste dans la zone.
- Il garde ses blessures d'un combat à l'autre ; abattu, il disparaît. S'il n'a personne à attaquer, il attend (en ville, le premier citoyen présent à la vérification suivante ou qui rentre).
- Mort face à lui : cause « dévoré par un citoyen transformé en zombie ».

### Régénération
- **Complète** (retour à PA max) : au réveil de chaque phase (jour→nuit ou nuit→jour), condition = avoir dormi **en ville**.
- **Partielle** : **sieste** en territoire externe (bouton « Sieste » de `/action`), uniquement dans une zone où **brûle un feu** (section 6), gratuite, **une fois par phase et par joueur** : **+25 % du PA max effectif** (arrondi à l'inférieur, sans dépasser le PA max ; refusée si déjà au max). Un jet de rencontre a lieu d'abord (taux de la zone, divisé par deux par le feu, section 5) : si un zombie surgit, la sieste est interrompue — aucun PA gagné, le combat commence.
- Dormir dehors sans feu = pas de régénération.


---

## 2. Faim & soif

Deux jauges séparées, 0–100.

| | Faim | Soif |
|---|---|---|
| Décroissance par phase (24h) | **−16** | **−20** |
| Seuil d'alerte (message dans la mairie) | < 30 | < 30 |
| Seuil critique (malus actif) | < 10 | < 10 |
| Malus de PA max | progressif dès que la jauge baisse (voir ci-dessous) | idem |
| Effet sous seuil critique | craft avancé et contribution aux chantiers bloqués | idem |
| Perte de PV sous seuil critique | **−1 PV** par phase | idem |
| Effet à 0 | −15 % PA max par phase supplémentaire écoulée à 0 (cumulable), **−2 PV** par phase | idem |

**Malus de PA max progressif** (remplace l'ancien −30 % fixe sous le seuil critique) : chaque jauge retire **30 % × ((100 − jauge) / 100)²** du PA max individuel, faible au début et de plus en plus fort en approchant de 0 :

| Jauge | 100 | 84 | 70 | 50 | 30 | 10 | 0 |
|---|---|---|---|---|---|---|---|
| Malus de PA max | 0 % | −0,8 % | −2,7 % | −7,5 % | −14,7 % | −24,3 % | −30 % |

Le PA max effectif étant arrondi à l'inférieur, toute baisse coûte au moins 1 PA. À 0, le −30 % reste actif et s'ajoute au −15 % par phase supplémentaire : une jauge vide depuis 2 phases supplémentaires coûte donc −60 % de PA max. Faim et soif se comptent séparément. Exemple (PA max 40) : faim 84 / soif 80 → 39 PA ; faim 52 / soif 40 → 32 PA ; les deux à 10 → 20 PA. Le passage à chaque palier plus grave (alerte, critique, vide) est annoncé dans la mairie en mentionnant le joueur.

→ Sans consommer, un joueur atteint la faim critique en **~6 phases (~6 jours réels)** et la soif critique en **~5 phases (~5 jours réels)**.
*(Décroissance doublée par rapport au premier jet de chiffrage, pour retomber sur l'objectif visé de "critique en 4-5 jours réels" — la faim reste légèrement plus longue que la soif, ce qui est cohérent : on peut tenir plus longtemps sans manger que sans boire.)*

### Consommation

Bouton « Manger / boire (sac) » de `/inventaire`, partout, et « Manger / boire (banque) » en ville, qui puise directement dans la banque de ville. **Gratuit en PA** (aucun coût dans la section 4). Les jauges sont plafonnées à 100 (le surplus est perdu) ; les remonter fait remonter le PA max effectif immédiatement, mais les PA actuels ne se rechargent qu'à la prochaine régénération. Une jauge qui remonte au-dessus de 0 remet à zéro son compteur de phases à vide.

| Objet | Effet |
|---|---|
| Baies | +5 faim |
| Gibier | +10 faim |
| Gros gibier | +25 faim |
| Eau brute | +10 soif, **20 % de risque de perdre 1 PV** par unité bue (mort possible : cause « eau croupie ») |
| Plat préparé | +20 faim |
| Conserve longue durée | +25 faim |
| Ragoût fortifiant | +40 faim, +2 PA au-delà du PA max à la prochaine régénération en ville (cumulable, conservé tant que le joueur est dehors) |
| Ration d'eau purifiée | +30 soif |
| Infusion médicinale | +15 soif (l'atténuation du malus d'infection n'est pas encore appliquée) |

Valeurs des bruts calées pour que cuisiner rapporte toujours plus : Baies + Gibier crus = 15 faim contre 20 pour le plat préparé ; 2 Gibier = 20 contre 25 pour la conserve ; 2 Eau brute = 20 soif à risque contre 30 sans risque pour la ration. Gros gibier (+25 faim, validé le 2026-10-03) : surtout rapporté par le piège avancé du chasseur (section 8), il nourrit plus que 2 Gibier (+20) mais pèse 3 et reste sous le ragoût fortifiant (+40). Le petit gibier et le gibier rare ne se consomment pas (voir section 5, objets sans mécanique définie).

### Régénération des ressources naturelles
- Ressources **naturelles** (bois, baies, gibier) : régénèrent de **+40 % du stock max de la zone par cycle** (jour+nuit), plafonnées au stock max.
- **Stock max par palier de zone (V1/bêta, ressources régénérantes uniquement — validé pour le lancement V1)** :

| Palier de zone | Stock max |
|---|---|
| Proche (palier 1) | 100 |
| Moyenne (palier 2) | 150 |
| Éloignée (palier 3) | 200 |

  Le stock max croît avec l'éloignement, cohérent avec le fait que les zones lointaines rapportent déjà plus d'objets par fouille (voir section 5) — s'applique aux ressources marquées "Oui" dans le tableau des ressources brutes (bois en forêt, baies, gibier).
- Ressources **transformées/loot fini** : **aucune régénération** — stock fini par zone, rechargé uniquement par événements IA ponctuels.

**Stocks des zones (mise en œuvre validée le 2026-09-29, valeurs de test)** : chaque zone a **deux stocks communs**, et **chaque objet trouvé en fouille puise une unité** dans le sien (même s'il est ensuite laissé sur place faute de place). Stock vide : l'objet tiré ne rapporte rien (trouvaille sans valeur).
- **Stock naturel** : bois **de forêt**, baies et **tous les gibiers** (gibier, petit, gros, rare) — max **100 / 150 / 200** (proche / moyenne / éloignée), zone pleine au départ, **+40 % du max à chaque aube** (une fois par aube pour le groupe, plafonné).
- **Stock fini** : tout le reste du butin (y compris le bois de la ville en ruines) — départ **800 / 600 / 400**, **sans régénération**. Dimensionné pour qu'un groupe de 3 villes puisse tout construire (≈ 1 000 ressources non régénérantes par ville, dont 635 Ferraille pour palissade, atelier et puits) : l'épuisement est une contrainte de fin de partie.
- **Recharge** : en attendant les événements IA, bouton « Recharger des territoires » (famille Ville de `/admin` et `/mj`) : remet au maximum le stock naturel, le stock fini ou les deux, pour les zones choisies (type, distance) du groupe d'une ville.
- **Indices** après une fouille, sans chiffres : sous 25 % « se font rares » / « bien pillée », à 0 « épuisées » / « plus rien à récupérer ».

### Rationnement (maire)
- **Informatif uniquement** (décidé le 2026-09-30, remplace l'ancien −30 % de consommation) : le maire fixe des portions max de nourriture et d'eau par citoyen et par jour et une consigne ; aucune mécanique ne les impose.

### Bannissement et exécution (validé le 2026-09-30)
- Vote de la ville ouvert **jusqu'au prochain changement de phase** (durée variable selon l'heure du lancement), citoyens vivants présents en ville ; adopté si Pour > Contre.
- Exécution d'une cible dehors : pendue dès son retour en ville.

### Élection du maire (validé le 2026-09-30)
- Déclenchable **à tout moment** par un citoyen vivant, une élection à la fois par ville, **sans mairie construite requise**.
- **24 h réelles de candidatures**, puis **24 h réelles de vote** (revote entre ex aequo : 24 h de vote directement).
- Mandat de l'élu : **4 cycles** à partir du cycle courant (comme le premier maire à la fondation).
- Fin de mandat (validé le 2026-09-30) : à l'aube du cycle qui suit le mandat, intérim du sortant et élection automatique (ou celle déjà en cours) ; sans élu, la ville reste sans maire.
- Mairie vacante (mort, départ, bannissement, exclusion, destitution) : élection automatique immédiate, sauf élection déjà en cours.
- Vote de défiance (validé le 2026-09-30) : **24 h réelles de vote** dès le déclenchement (pas de candidatures), citoyens vivants présents en ville ; destitution si Destituer > Maintenir, égalité ou aucun vote = maintenu.
- Égalité : le plus d'XP l'emporte (tous à 0 tant que l'XP est reportée en V2), sinon revote. Candidat unique élu d'office ; aucun candidat ou aucune voix : sans effet.

---

## 3. Défense de la ville

| Composant | Valeur |
|---|---|
| Défense de base (sans rien construit, sans garde) | **5** |
| Bonus palissade — palier 1 à 8 | +5 / +5 / +6 / +6 / +7 / +7 / +8 / +8 (cumulés = **+52** au palier 8 max) |
| Bonus par garde volontaire, citoyen normal | +3 |
| Bonus par garde volontaire, métier Garde | +6 |
| Coût pour se porter volontaire (nuit uniquement) | −6 PA |

**Défense totale = base + bonus palissade (palier atteint) + Σ bonus des gardes assignés cette nuit-là.**

**Garde volontaire** (bouton « Monter la garde » de `/action`, avec confirmation) : **la nuit uniquement**, pour un citoyen **vivant en ville**, une fois par nuit, **6 PA**. Le bonus compte à l'attaque de l'aube si le garde est **toujours vivant et en ville** à ce moment-là (parti dehors, il ne compte plus). Annonce sur la place publique ; le compte rendu de l'aube détaille la défense (base, palissade, nombre de gardes et leur bonus).

### Attaque de zombies
- Force de base, nuit 1 : **15**
- Croissance : **+10 % composé** par cycle nuit suivant — validé tel quel pour le lancement V1 (cohérent avec l'objectif d'une palissade palier 8 atteinte juste avant que l'attaque dépasse le mur passif, voir section 9)
- Modificateur météo : mauvais temps = **+15 %** sur la force d'attaque
- Alerte : la mairie de chaque ville en nuit est prévenue **1 h** avant l'attaque de l'aube (en plus des annonces de bascule jour/nuit, qui mentionnent le rôle-ville)

| Cycle (nuit n°) | Force d'attaque (base, hors météo) |
|---|---|
| 1 | 15 |
| 2 | 16,5 |
| 3 | 18,2 |
| 5 | 22 |
| 10 | 35 |
| 15 | 56 |

### Défense insuffisante
- Déficit = Attaque − Défense (si positif)
- **Dégâts sur chantiers** : voir ci-dessous (cascade validée le 2026-09-30)
- **Victimes parmi les citoyens présents en ville** : leur nombre est proportionnel à `déficit / attaque`, tirées au hasard (détail ci-dessous).

### Blessures en défense insuffisante (PV perdus)
Seuls les citoyens présents en ville (pas en territoire externe) sont exposés (révisé le 2026-10-03 : plus de jet indépendant par citoyen ni de plafond à 50 %) :
- **Ratio** = `déficit / attaque` (0 à 100 %).
- **Nombre de victimes** = `ratio × citoyens présents` ; la partie décimale est la chance d'une victime de plus. Les victimes sont **tirées au hasard** parmi les présents.
- **Maison privée** : une victime tirée au sort a **25 % de chance par palier au-delà du palier 1** de repousser les zombies depuis sa maison (sans maison ou P1 : 0 % ; P2 : 25 % ; plafond 75 % si d'autres paliers arrivent). Si elle se défend, personne n'est frappé à sa place.
- **PV perdus par victime** = `ceil(min(50 %, ratio) × 10)`, soit **1 à 5 PV** : un petit déficit égratigne, un déficit de moitié ou plus coûte 5 PV.
- Être frappé est aussi un coup reçu : 10 % de chance d'infection (section 1).
- Il n'y a plus de jet « fatal » séparé : on meurt seulement si ces pertes font tomber à 0 PV.

**Exemples** :
- Attaque 20 contre défense 18, 10 présents → ratio 10 % → 1 victime, 1 PV perdu (25 % de chance de s'en tirer en maison P2).
- Attaque 18,2 contre défense 5, 4 présents → ratio 72,5 % → 2,9 : 2 victimes, 90 % de chance d'une troisième, 5 PV perdus chacune.
- Seul en ville avec un ratio de 72,5 % → 72,5 % de chance d'être frappé. Deux nuits de 5 PV suffisent à tuer un joueur en pleine santé.

### Dégâts sur les chantiers (validé le 2026-09-30)
Après les blessures, le **déficit devient un budget de dégâts**, consommé dans cet ordre. Chaque élément détruit absorbe sa valeur de défense, donc un petit déficit ne touche que les premières cibles :
1. **Structures de défense avancées** : une détruite par tranche de **3 points** (entamée), jusqu'à ce qu'il n'en reste plus.
2. **Palissade** : s'il reste du budget, elle perd **1 palier** (jamais plus d'un par attaque), ce qui absorbe le bonus de ce palier (5 à 8 points).
3. **Avancement en cours** (ressources déposées et PA installés sur le prochain palier de **tous** les chantiers et de **toutes** les maisons privées des habitants vivants) : chaque point restant en détruit **10 %** (arrondi en faveur des zombies), **10 points au plus** (100 %).
4. S'il reste encore **5 points ou plus** : **−1 palier** sur un bâtiment construit tiré au hasard (place publique, puits, atelier, tour radio, mairie ou maison privée d'un habitant vivant ; pas la palissade). Un seul par attaque.

Un palier perdu fait perdre son bonus aussitôt (atelier sous le palier 1 : salon fermé ; tour radio : ondes réservées aux porteurs de radio). L'avancement déjà déposé au-delà du coût du palier à reconstruire est perdu. Les dégâts sont détaillés dans le compte rendu de l'aube en mairie.

**Exemples** :
- Déficit 10, 2 structures, palissade P3 → 2 structures détruites (6 points), palissade P3 → P2 (absorbe les 4 restants).
- Déficit 3, pas de structure, palissade P3 → palissade P3 → P2.
- Déficit 20, pas de structure, palissade P1 → palissade P1 → P0 (5), avancement en cours entièrement perdu (10), puis −1 palier au hasard (5 restants).

*Pour la sieste en territoire externe (section 1), le jet de risque déclenche simplement une rencontre — c'est alors la table de rencontre (section 5) et le combat qui déterminent l'issue, pas cette formule.*

---

## 4. Coûts des actions en PA

Coût de nuit = coût de jour × **1,5** (arrondi au PA supérieur), sauf mention contraire. Le coût d'un déplacement dépend du palier de la zone d'arrivée.

| Action | Coût (jour) | Coût (nuit) |
|---|---|---|
| Déplacement — zone proche (palier 1) | 2 PA | 3 PA |
| Déplacement — zone moyenne (palier 2) | 3 PA | 5 PA |
| Déplacement — zone éloignée (palier 3) | 4 PA | 6 PA |
| Retour en ville (depuis une zone proche) | 2 PA | 3 PA |
| Surcoût — entrée dans une zone vierge (absente de la carte de découverte du joueur), sauf éclaireur | +2 PA | +2 PA (valeur fixe, pas ×1,5 ; s'applique aussi au trajet à la torche) |
| Observer (zones adjacentes, depuis une zone ou la ville) | 1 PA | 2 PA |
| Observer — éclaireur | 0 PA | 1 PA (valeur fixe, pas ×1,5) |
| Partager sa carte (bouton de `/action`, en ville uniquement) | 0 PA | 0 PA |
| Fouiller/looter la zone courante | 2 PA | 3 PA |
| Allumer un feu (territoire externe, consomme 1 Feu) | 1 PA | 2 PA |
| Sieste (zone avec un feu, une fois par phase) | 0 PA | 0 PA |
| Poser un piège, simple ou avancé (forêt ou montagnes, consomme le piège) | 1 PA | 2 PA |
| Relever la prise d'un piège | 0 PA | 0 PA |
| Combat — attaquer (par échange) | 2 PA (arme : −1 ou −2, jamais sous 1) | 3 PA (idem) |
| Combat — fuir | 1 PA | 2 PA (+ risque d'échec accru la nuit) |
| Craft simple (`/inventaire`) | 1 PA (symbolique) + ingrédients | idem |
| Craft avancé (atelier) | 4–8 PA selon recette + ingrédients | — (en ville uniquement) |
| Contribution à un chantier (par unité de ressources déposées) | voir section 6 | — |
| Se porter volontaire pour la garde | — | 6 PA |
| Soin basique (+2 PV) | 2 PA + 1 Bandage | 3 PA + 1 Bandage |
| Soin avancé, médecin (+5 PV) | 4 PA + 1 Médicament basique, ou 1 Bandage + 1 Plante médicinale | 6 PA + mêmes ingrédients |
| Craft remède infection (médecin, exclusif) | 6 PA + ingrédients rares | — |
| Réparation voiture (ingénieur, atelier palier 1) | 8 PA + pièces | — |
| Voiture — déplacement à plusieurs (bonus) | −50 % PA du trajet, partagé entre passagers | idem |

**Anti-spam de `/action`** : **3 secondes** minimum entre deux ouvertures de `/action` par un même joueur ; un seul menu ouvert à la fois (en rouvrir un ferme le précédent).

---

## 5. Ressources brutes (matières premières)

Onze ressources de base, chacune associée à une ou plusieurs zones. Elles alimentent à la fois le craft (section 8) et les chantiers (section 7).

| Ressource | Zones principales | Régénérante ? |
|---|---|---|
| **Bois** | Forêt (principale), Ville en ruines (occasionnel) | Oui (forêt uniquement) |
| **Tissu** | Ville en ruines, Marécages | Non |
| **Ferraille / Métal** | Ville en ruines, Montagnes | Non |
| **Pierre / Minerai** | Montagnes | Non |
| **Eau brute** | Marécages | Non (à purifier pour consommation fiable) |
| **Baies / plantes comestibles** | Forêt | Oui |
| **Gibier / viande** | Forêt, Montagnes | Oui (animaux) |
| **Plantes médicinales** | Marécages, Montagnes (rare) | Non |
| **Pièces mécaniques** | Ville en ruines, Montagnes | Non |
| **Ingrédient de remède** | Toutes zones éloignées (très rare), également en zone moyenne à taux réduit | Non |
| **Munitions / poudre** | Ville en ruines (rare) | Non |

### Loot par zone (quantités et probabilités révisées à la hausse ; loot rare étendu à la zone moyenne)

| Zone | Proche (palier 1) | Moyenne (palier 2) | Éloignée (palier 3) |
|---|---|---|---|
| **Ville en ruines** | 2–3 objets — 50 % Tissu, 30 % Ferraille, 10 % Médicament basique | 2–4 objets — 30 % Ferraille, 30 % Pièces mécaniques, 15 % Munitions, 10 % Arme simple, 5 % Ingrédient de remède | 3–5 objets — 25 % Pièces mécaniques, 20 % Munitions, 15 % Arme avancée, 10 % Ingrédient de remède |
| **Forêt** | 2–3 objets — 55 % Bois, 25 % Baies, 15 % Petit gibier | 2–4 objets — 35 % Bois, 30 % Gibier, 15 % Baies, 10 % Plante médicinale, 5 % Ingrédient de remède | 3–5 objets — 25 % Gros gibier, 20 % Plante médicinale, 15 % Bois rare, 10 % Ingrédient de remède |
| **Marécages** | 2–3 objets — 45 % Eau brute, 25 % Tissu, 15 % Plante médicinale | 2–4 objets — 30 % Eau brute, 25 % Plante médicinale, 20 % Tissu, 10 % Pièces mécaniques rouillées, 5 % Ingrédient de remède, 5 % Radio | 3–5 objets — 25 % Plante médicinale, 20 % Ingrédient de remède, 15 % Objet rare, 10 % Radio |
| **Montagnes** | 2 objets — 45 % Pierre/Minerai, 20 % Gibier rare | 2–4 objets — 30 % Pierre/Minerai, 25 % Ferraille, 15 % Munitions, 5 % Ingrédient de remède | 3–5 objets — 25 % Minerai rare, 20 % Arme avancée, 15 % Pièces pour voiture, 10 % Ingrédient de remède |

**Règles transverses** : Ingrédient de remède ≤ 10 % en zone éloignée, **5 % en zone moyenne** (nouveau), 0 % en zone proche. Radio ≤ 10 % en zone éloignée (marécages uniquement), **5 % en zone moyenne** (marécages, nouveau), 0 % ailleurs et en zone proche. Rencontres tirées séparément du loot.

**Tirage d'une fouille** : le nombre d'objets est tiré uniformément dans la fourchette de la case (ex. 2–3), puis chaque objet est tiré indépendamment avec les probabilités de la case telles quelles. Le complément à 100 % (ex. 10 % pour 50 + 30 + 10 %) est une trouvaille sans valeur : cet objet-là ne rapporte rien. Une fouille peut donc rapporter moins d'objets que la fourchette, voire aucun.

**Objets sans mécanique définie (validé pour le lancement V1)** : les entrées suivantes du tableau ci-dessus n'ont ni recette ni effet chiffré — Petit gibier, Gibier rare, Bois rare, Minerai rare, Pièces mécaniques rouillées, Pièces pour voiture, Objet rare. Elles sont cataloguées comme objets à part entière (donc tirables et stockables dès la V1) mais sans alias ni comportement mécanique — l'effet de chacune reste **un point ouvert**, à trancher lors d'une prochaine passe d'équilibrage plutôt qu'à la lancer sans base claire. Le Gros gibier en est sorti le 2026-10-03 (+25 faim, section 2).

### Poids et capacité (sac et banque de ville)

Chaque objet a une classe de poids, qui compte de la même façon dans le sac et dans la banque de ville :

| Classe | Poids | Objets |
|---|---|---|
| **Petit** | 1 | Tissu, Baies, Plante médicinale, Ingrédient de remède, Munitions, Pièces mécaniques, Pièces mécaniques rouillées, Minerai rare, Médicament basique, Bandage, Torche, Ration d'eau purifiée, Remède contre l'infection, Infusion médicinale, Conserve longue durée |
| **Moyen** | 2 | Bois, Ferraille, Eau brute, Gibier, Petit gibier, Bois rare, Objet rare, Arme simple, Arme de fortune, Plat préparé, Ragoût fortifiant, Piège simple, Feu |
| **Lourd** | 3 | Pierre, Gros gibier, Gibier rare, Arme avancée, Pièces pour voiture, Pièges avancés, Structures de défense avancées, Armes/outils avancés, Réparation voiture |

- **Équipement (poids 0)** : la **Radio** se porte sans prendre de place. Elle n'apparaît pas dans la grille du sac mais à part, à côté des PA et de la charge.
- **Sac : capacité 12.** Une fouille rapporte en moyenne 3–4 objets de poids 2 (≈ 7) : une à deux fouilles avant de devoir rentrer, avec de la place pour une ration et une torche. Bonus de capacité (métier, sac à dos) : piste pour plus tard.
- **Banque de ville : 40 sans place publique, 80 au palier 1, 160 au palier 2** (reconversion des 40 / 80 objets de la section 7 avec un poids moyen de 2). Les ressources déposées pour un chantier ne passent pas par la banque et n'en consomment pas la capacité.
- **Fouille** : refusée sans coût en PA si le sac est plein (plus de place même pour un objet de poids 1). Sinon, les objets entrent dans l'ordre du tirage tant qu'ils rentrent ; ceux qui ne rentrent pas restent sur place et sont perdus (pas encore d'objets au sol dans les zones). Un objet plus léger tiré après un objet trop lourd peut encore entrer.
- **Don, fabrication, dépôt et retrait à la banque** : refusés si le résultat fait dépasser la capacité de celui qui reçoit (le destinataire du don, le sac pour la fabrication et le retrait, la banque pour le dépôt). Le poids d'une fabrication se compte après retrait des ingrédients : une fabrication qui allège le sac reste toujours possible.
- **Déposer un objet** (`/inventaire`, gratuit) : l'objet quitte le sac et disparaît, pour alléger un sac trop lourd. Gestion des objets au sol reportée.
- **Inventaire déjà au-dessus de sa capacité** (mise en place de la limite, ajout par un admin) : rien n'est supprimé, mais il n'accepte plus rien qui l'alourdisse tant qu'il n'est pas repassé sous la limite.

### Rencontres en territoire externe (zombies uniquement pour la V1)
Pour la v0.1, stub simplifié : **zombie uniquement**, probabilité liée au palier de la zone (aucune rencontre humaine/bandit encore implémentée — la table complète est confirmée hors scope V1, voir section 11) :

| Palier | Probabilité de rencontre zombie (par fouille/déplacement) |
|---|---|
| Proche (palier 1) | 15 % |
| Moyenne (palier 2) | 30 % |
| Éloignée (palier 3) | 45 % |

- *(Relevées le 2026-09-29, depuis 10 / 20 / 35 %, jugées trop rares en test.)*
- **Feu** allumé dans la zone : chance finale (bonus compris) **divisée par deux** jusqu'au changement de phase (section 6).
- **Risque qui monte à chaque fouille** : chaque fouille d'affilée sans zombie ajoute **+10 points** à la chance des jets suivants de ce joueur (fouille comme arrivée dans une zone), plafonnée à 100 %. Le compteur revient à 0 dès qu'un zombie surgit ou que le joueur rentre en ville. Ex. zone éloignée de jour : 45 %, puis 55, 65, 75 %…
- **La nuit** : probabilité de base ×1,5 (22,5 / 45 / 67,5 %), avant le bonus des fouilles, cohérent avec le principe "la nuit, rencontres plus dangereuses".
- **Jet** après chaque fouille et à chaque arrivée dans une zone. Tant que la rencontre dure, `/action` ne propose plus que « Attaquer » et « Fuir » : ni fouille, ni déplacement, ni observation, ni retour en ville.

### Combat contre un zombie

| | Proche | Moyenne | Éloignée |
|---|---|---|---|
| PV du zombie | 2 | 3 | 4 |

- **Attaquer** (coût : section 4) : le joueur touche à **70 %** et retire **1 PV** au zombie. Si le zombie est encore debout, il **riposte à 30 %** : **−1 PV** pour le joueur, et c'est un coup reçu (**10 % d'infection**, section 1). Zombie à 0 PV : rencontre terminée, pas de butin pour l'instant.
- **Armes** portées dans le sac, seule la meilleure compte (dans cet ordre, sans cumul) : **Armes/outils avancés** et **Arme avancée** : −2 PA par attaque et **2 dégâts** par coup ; **Arme simple** : **+10 %** de chance de toucher ; **Arme de fortune** : −1 PA par attaque. Une attaque coûte toujours au moins 1 PA.
- **Fuir** (coût : section 4) : réussite **75 % le jour, 50 % la nuit**. Réussie : le joueur rebrousse chemin vers la zone (ou la ville) d'où il arrivait, ou reste sur place libéré si le zombie a surgi pendant une fouille. Ratée : le zombie frappe (**−1 PV, sans infection** : fuir n'expose jamais à l'infection) et la rencontre continue.
- **Rencontre laissée en suspens** (plus assez de PA, joueur absent) : **−1 PV à la tombée de la nuit** tant qu'elle dure (à l'aube, seule la horde frappe).

### Changements de phase pour les survivants dehors (vivants ou exclus)
- **Tombée de la nuit** : pas d'attaque. Sauf zombie déjà présent (−1 PV ci-dessus), **jet de rencontre au taux de nuit** de la zone (22,5 / 45 / 67,5 %), divisé par deux si un feu brûlait pendant la journée qui s'achève, **sans** le bonus des fouilles. Un zombie qui surgit ouvre la rencontre, sans dégâts immédiats ; le joueur est mentionné dans le salon de sa zone.
- **Aube — la horde** (en même temps que l'attaque de la ville, avant faim/soif) : **tout survivant dehors est attaqué**, sans jet. **PV perdus d'entrée : 3 / 4 / 5** (proche / moyenne / éloignée), **−2 si un feu brûlait** (relevé le 2026-10-03, depuis 1 / 2 / 3 et −1) pendant la nuit qui s'achève ; c'est un coup reçu (**10 % d'infection**). S'il survit, un combat s'ouvre contre un zombie aux PV de la zone (s'il en avait déjà un sur le dos, il ne prend que les dégâts). Mention dans le salon de zone ; les morts (« dévoré par la horde ») sont annoncées dans la mairie avec le compte rendu de l'attaque. Rester dehors la nuit coûte donc toujours cher : il faut être rentré avant l'aube.
- *(Point de conception tranché le 2026-09-29 : auparavant un joueur dehors échappait entièrement à l'attaque de l'aube.)*
- Mort en combat : cause « tué en territoire externe ».
- Ordre de grandeur : à mains nues, un zombie moyen demande ~4,3 échanges (~9 PA le jour) et coûte ~1 PV.

---

## 6. Craft simple (`/inventaire`, ouvert à tous)

Coût PA symbolique (1 PA), coût réel = ingrédients. Liste évolutive.

| Recette | Ingrédients | Effet |
|---|---|---|
| Bandage | 2 Tissu | +2 PV |
| Plat préparé | 1 Baies + 1 Gibier | +20 faim |
| Feu | 2 Bois | Allumé en territoire externe (bouton « Allumer un feu » de `/action`, section 4), sécurise la zone **jusqu'au changement de phase suivant** pour tous les survivants présents : sieste possible (section 1) et chance de rencontre **divisée par deux** (section 5). Un seul feu par zone à la fois |
| Arme de fortune | 1 Ferraille + 1 Bois | −1 PA de coût sur l'action "attaquer" |
| Ration d'eau purifiée | 2 Eau brute + 1 Tissu (filtre) | +30 soif, sans risque contrairement à l'eau brute |
| Torche | 1 Bois + 1 Tissu | Annule le surcoût nocturne d'un seul déplacement (consommable, un usage) |
| Piège simple | 2 Bois + 1 Ferraille | Posé dans une zone de forêt ou de montagnes : capture 1 Gibier à chaque aube avec 60 / 75 / 90 % de chance (proche / moyenne / éloignée) ; mêmes règles que le piège avancé (section 8), qui capture du Gros gibier |

---

## 7. Bâtiments — bonus passifs & coûts en ressources

**Fonctionnement (validé le 2026-09-29)** : panneau permanent dans le salon `#chantiers` de chaque ville, mis à jour à chaque avancée. Les citoyens **vivants présents en ville** (faim et soif ≥ 10) déposent des ressources sur le prochain palier d'un bâtiment, **depuis leur sac ou directement depuis la banque de ville** (gratuit, au plus ce qui manque ; journal public), et versent des **PA d'installation au fur et à mesure** : à tout moment, on peut installer jusqu'à **2 PA par tranche de 10 ressources déjà déposées** (plafonné au coût du palier). Le palier est construit quand ressources et PA sont complets : bonus immédiat, annonce dans `#chantiers` et dans la mairie, avancement remis à zéro pour le palier suivant. **Maison privée** (validé le 2026-09-30) : même mécanique, mais personnelle, sur un panneau permanent du salon `#maisons-privées` (Contribuer sac / Contribuer banque / Installer, et « Ma maison » pour la progression, visible du seul joueur). Ressources du sac **ou de la banque** (prises journalisées), 2 PA par tranche de 10 ressources ; palier construit annoncé dans `#maisons-privées` (pas en mairie). La progression est propre à chaque joueur.

Coût par palier en **ressources déposées sur le chantier**, puis **installation** = 2 PA par tranche de 10 points de ressources déposées, gardé tel quel pour le lancement V1 (le vrai goulot d'étranglement est l'acquisition — chaque fouille ne rapporte que 2-5 objets, donc réunir plusieurs centaines de points de ressources prend naturellement plusieurs phases, même si l'installation elle-même est peu coûteuse en PA).

| Bâtiment | Palier | Coût en ressources | Installation (PA) | Bonus passif |
|---|---|---|---|---|
| **Palissade** | 1 | 40 Bois + 10 Ferraille | 10 | Défense +5 |
| | 2 | 60 Bois + 15 Ferraille | 15 | Défense +5 (total +10) |
| | 3 | 90 Bois + 25 Ferraille | 23 | Défense +6 (total +16) |
| | 4 | 130 Bois + 35 Ferraille | 33 | Défense +6 (total +22) |
| | 5 | 180 Bois + 50 Ferraille | 46 | Défense +7 (total +29) |
| | 6 | 240 Bois + 70 Ferraille | 62 | Défense +7 (total +36) |
| | 7 | 310 Bois + 90 Ferraille | 80 | Défense +8 (total +44) |
| | 8 | 400 Bois + 120 Ferraille | 104 | Défense +8 (total +52) |
| **Atelier** | 1 | 30 Bois + 60 Ferraille + 15 Pièces mécaniques | 21 | Craft avancé de base + réparation voiture |
| | 2 | 40 Bois + 100 Ferraille + 30 Pièces mécaniques | 34 | Recettes avancées supplémentaires |
| **Puits** | 1 | 50 Pierre + 20 Ferraille | 14 | À chaque aube, **1 Ration d'eau purifiée par habitant vivant** versée dans la banque de ville (dans la limite de sa capacité, le surplus est perdu) — couvre ~75 % de la soif perdue en un cycle (2 × −20 contre +30) |
| | 2 | 90 Pierre + 40 Ferraille | 26 | Production **+25 %** (arrondie au supérieur) / −20 % conso de soif collective (pas encore appliqué) |
| **Place publique** | 1 | 50 Bois + 30 Tissu | 16 | Banque de ville : capacité 80 en poids (40 sans place publique, section 5) |
| | 2 | 90 Bois + 60 Tissu | 30 | Banque de ville : capacité ×2, soit 160 en poids |
| **Maison privée** (perso) | 1 | 30 Bois + 15 Tissu | 9 | (fonctionnel) — chaque joueur arrive sans maison (palier 0) et la construit |
| | 2 | 50 Bois + 30 Tissu | 16 | +15 % du PA max personnel |
| **Tour Radio** | unique | 20 Bois + 40 Ferraille + 20 Pièces mécaniques | 16 | Tous les habitants vivants **présents en ville** accèdent au salon `ondes-radio` du groupe, radio ou non (dehors, seuls les porteurs de radio y accèdent) ; dehors, les **porteurs de radio** gardent l'accès complet aux salons de la ville (sans tour, seule la mairie reste lisible dehors). Chiffrée le 2026-09-30 |
| **Mairie** | unique | 80 Bois + 40 Pierre | 24 | Fonctionnel uniquement (élections, décisions, rationnement) |

---

## 8. Craft avancé (atelier requis) — une recette exclusive par métier

| Métier | Recette | Ingrédients | Coût PA | Effet |
|---|---|---|---|---|
| **Médecin** | Remède contre l'infection | 2 Plante médicinale + 1 Ingrédient de remède + 1 Ration d'eau purifiée | 6 | Guérit l'infection en cours |
| **Ingénieur/bâtisseur** | Réparation voiture (palier 1 atelier) | 4 Pièces mécaniques + 2 Ferraille | 8 | Débloque le déplacement en voiture (−50 % PA partagé) |
| **Ingénieur/bâtisseur** | Structures de défense avancées | 3 Ferraille + 3 Bois + 2 Pierre | 8 | Bonus de défense de nuit additionnel, indépendant des paliers de palissade |
| **Cuisinier** | Ragoût fortifiant | 1 Gibier + 2 Baies + 1 Eau purifiée | 5 | +40 faim + 2 PA au prochain réveil |
| **Cuisinier** | Conserve longue durée | 2 Gibier + 1 Tissu (emballage) | 4 | +25 faim, ne se dégrade jamais, idéal en réserve de ville pour le rationnement |
| **Cuisinier** | Infusion médicinale | 1 Plante médicinale + 1 Eau purifiée | 4 | +15 soif, atténue d'1 point le malus PA de l'infection pendant 1 phase (soulage sans guérir) |
| **Chasseur/trappeur** | Pièges avancés | 2 Ferraille + 2 Bois + 1 Gibier (appât) | 5 | Posé dans une zone de forêt ou de montagnes : 60 / 75 / 90 % de chance (proche / moyenne / éloignée) de capturer un Gros gibier à chaque aube |
| **Artisan** | Armes/outils avancés | 3 Ferraille + 2 Bois + 1 Pièce mécanique | 6 | −2 PA sur "attaquer" + bonus dégâts en combat |

**Fonctionnement (validé le 2026-09-29)** :
- Le salon **`atelier`** de la ville n'existe qu'une fois l'atelier construit (palier 1). Le bouton **« Craft avancé »** de `/inventaire` n'apparaît que si la commande est lancée **dans ce salon**, par un citoyen vivant en ville, faim et soif ≥ 10. Il propose les recettes du métier du joueur ; les ingrédients sont pris **dans le sac, puis complétés par la banque de ville** ; coût en PA de la recette, identique la nuit. Aucune recette n'est encore réservée au palier 2 de l'atelier.
- **Remède contre l'infection** : administré par le **médecin** (option du bouton « Soigner » de `/action`, sur soi ou un survivant au même endroit, gratuit en PA). L'infection étant cachée, le joueur doit dire au médecin qu'il est infecté : si la cible ne l'était pas, le remède est **consommé** et un message d'erreur le signale.
- **Structures de défense avancées** : posées avec le bouton « Poser une structure » du panneau `#chantiers` (sac, puis banque) : **+3 défense** chacune (jusqu'à leur destruction par une attaque mal contenue, section 3), **5 au plus (+15)**, comptées dans la défense de l'aube (section 3).
- **Infusion médicinale** : le malus PA de l'infection est réduit de **10 points** (ex. −25 % → −15 %, sans passer sous 0) jusqu'au prochain changement de phase ; l'incubation n'est pas ralentie.
- **Réparation voiture** : fabricable, effet à venir (T39).
- **Pièges (validé le 2026-10-03)** — le **piège simple** (craft simple, section 6) capture du **Gibier**, le **piège avancé** du chasseur du **Gros gibier** ; sinon, mêmes règles : posés en territoire externe avec le bouton « Piège » de `/action` (le piège du sac, 1 PA, 2 la nuit ; un bouton par type de piège porté), par n'importe quel survivant qui en porte un, **uniquement en forêt ou en montagnes** (là où vit le gibier, section 5) et **un seul piège par zone**. Le piège est **permanent**. À chaque aube (une fois par aube pour le groupe, juste après la repousse des ressources naturelles), un piège vide capture **1 proie** avec une chance qui croît avec l'éloignement de la zone : **60 %** en zone proche, **75 %** en moyenne, **90 %** en éloignée ; la proie est puisée dans le stock naturel de la zone (rien si le stock est vide). La prise attend dans le piège, qui ne capture plus rien tant qu'elle n'est pas relevée (**1 prise au plus**). **N'importe quel survivant présent dans la zone, de n'importe quelle ville**, peut la relever gratuitement (place dans le sac requise) ; le relevage est annoncé dans le salon de la zone. Le piège apparaît sur la **carte de son poseur** et de ceux qui reçoivent ensuite sa carte en partage (qui la retransmettent à leur tour) ; les autres ne le voient qu'en passant dans la zone.

**Coûts PA (validés)** : seuls le remède et la réparation voiture avaient un chiffre exact au premier jet ; les 6 autres recettes n'étaient couvertes que par la fourchette générale de la section 4 (4–8 PA). Chiffrage retenu par palier d'utilité, cohérent avec les deux valeurs déjà fixées : 8 PA pour les bonus durables/structurels (structures de défense, à l'image de la réparation voiture), 6 PA pour un bonus de combat permanent (armes/outils avancés, même tier que le remède), 5 PA pour un effet notable mais consommable (pièges avancés, ragoût fortifiant), 4 PA pour un effet mineur/de confort (conserve longue durée, infusion médicinale).

Les 3 recettes cuisinier sont gardées telles quelles pour le lancement V1 (pas de nerf), malgré le déséquilibre relevé face aux autres métiers à une seule recette exclusive — à surveiller pendant la bêta plutôt qu'à corriger a priori.

---

## 9. Cohérence globale — ce que ça donne en jeu

- Une ville de 15 joueurs pleinement investie peut espérer atteindre la palissade palier 8 vers le cycle 8–10 si elle priorise la construction — juste avant que la courbe d'attaque ne dépasse le mur passif (nuit 13–14).
- L'acquisition de ressources (pas l'installation) est le vrai frein aux chantiers : avec 2–5 objets par fouille et plusieurs ressources différentes requises par palier, réunir 400 Bois + 120 Ferraille pour la palissade palier 8 nécessite des dizaines d'allers-retours répartis sur plusieurs joueurs et plusieurs phases.
- La faim/soif oblige à des allers-retours réguliers vers les zones proches (régénérantes), pendant que les ingrédients de remède et les pièces rares forcent des incursions ponctuelles en zones éloignées (et désormais, à un rythme plus soutenu, en zones moyennes).
- Les 5 métiers à recette exclusive sont chacun un goulot d'étranglement réel : sans médecin, pas de remède (l'infusion du cuisinier ne fait que ralentir l'échéance, pas la stopper) ; sans ingénieur, pas de voiture ni de défense avancée.
- Se porter volontaire garde dès la nuit 1 est quasi obligatoire : sans palissade ni garde, la défense de base (5) contre une attaque de 15 laisse un déficit de 10, soit 2 citoyens présents sur 3 frappés — l'organisation de la garde doit être opérationnelle dès le premier cycle, pas ajoutée plus tard.

---

## 10. Points tranchés pour le lancement V1

Tous les points listés comme ouverts ont été tranchés pour permettre le lancement du développement :

- **Croissance de l'attaque de zombies** : +10 %/cycle composé, validé tel quel (section 3).
- **Rythme d'installation des chantiers** : 2 PA/10 points de ressources, gardé tel quel — coût symbolique assumé, le vrai frein reste l'acquisition (section 7).
- **Probabilités de loot rare** : zone moyenne ajoutée à 5 % pour l'ingrédient de remède (et la radio en marécages), en plus du ≤10 % déjà existant en zone éloignée (section 5).
- **Malus PA de l'infection** : passage d'un système à paliers par jour à une progression linéaire continue, de 0 % à −30 % sur les 96h d'incubation (section 1).
- **Équilibre cuisinier** : les 3 recettes avancées sont gardées telles quelles, à surveiller en bêta plutôt qu'à nerfer a priori (section 8).
- **Stock max des ressources naturelles par palier** : 100/150/200 (proche/moyenne/éloignée) validé tel quel (section 2).
- **Coût PA des 6 recettes avancées restantes** : chiffré par palier d'utilité (4 à 8 PA), voir section 8.
- **Capacité de stockage** : poids d'objet 1/2/3, sac 12, banque 40/80/160 selon la place publique, voir section 5.

## 11. Hors scope V1 (reporté volontairement à la bêta)

- **Table complète des rencontres en territoire externe** : dangerosité différenciée par zone, rencontres humaines/bandits, capture de bandit. Le stub zombie uniquement (15/30/45 % par palier, ×1,5 la nuit — section 5) suffit pour lancer le développement V1 ; l'extension complète est prévue pendant la phase de bêta, avec de vrais retours joueurs pour la calibrer.

## 12. Points ouverts restants

- **Effet mécanique des objets de loot sans recette** (section 5) : Petit gibier, Gibier rare, Bois rare, Minerai rare, Pièces mécaniques rouillées, Pièces pour voiture, Objet rare. Catalogués comme objets distincts pour permettre le loot dès la V1, mais sans effet défini — à trancher avant que leur usage (soin, combat, craft...) soit implémenté côté bot.
