# Disc'Hordes — Document d'équilibrage V1 (bêta)

**Principe directeur** : difficulté élevée. Les marges sont volontairement serrées — une ville mal organisée doit pouvoir tomber en quelques cycles. Tous les chiffres ci-dessous sont un **point de départ chiffré et cohérent entre lui**, à recalibrer après les premières sessions de bêta.

Base de référence : ville de **15 joueurs max**, cycle de **48h réelles** (24h jour + 24h nuit), attaque de zombies à minuit du second jour.

> **Mise à jour** : décroissance faim/soif doublée, sévérité du jet de risque chiffrée, déclenchement de l'infection formalisé, stub v0.1 pour les rencontres en territoire externe, stock max des ressources naturelles chiffré par palier de zone ; **tous les points ouverts de la section 10 sont désormais tranchés** — malus PA de l'infection passé en linéaire continu, loot rare étendu à la zone moyenne, croissance de l'attaque/rythme d'installation/recettes cuisinier/stock de ressources naturelles validés tels quels. Seule la table complète des rencontres humaines/bandits reste hors scope V1 (voir section 11).

---

## 1. Points d'action (PA)

Changement de logique par rapport à une V0 à PA fixe unique pour tous : **le PA max individuel n'est plus une constante universelle, mais il reste fixe pour un joueur donné une fois attribué**. On fixe un budget total dont une ville a besoin par phase, ce budget est réparti à parts égales entre les habitants présents **au lancement de la ville** (`/fonder-ville`), et cette valeur individuelle ne bouge plus ensuite pour la durée de la partie.

### Budget de ville — PA cible
- **PA cible par ville et par phase : 180.** Cette valeur représente ce qu'une ville a besoin de pouvoir produire collectivement pour fonctionner (chantiers, défense, exploration) — elle ne dépend pas du nombre d'habitants, c'est un paramètre de conception fixe (ajustable en admin plus tard si besoin).
- **PA max individuel = floor(180 ÷ nombre d'habitants présents au lancement de la ville)**, plafonné à **40 PA** pour éviter qu'une ville lancée très réduite (1 à 4 fondateurs) n'obtienne des PA individuels absurdes.
- **Ce calcul n'a lieu qu'une seule fois, à `/fonder-ville`.** Il n'est **jamais recalculé** ensuite, ni pour les morts, ni pour les départs (`/quitter-ville`, exclusion), ni pour les arrivées. La perte ou le gain d'habitants change la capacité collective réelle de la ville, mais ne modifie le PA max d'aucun joueur individuel déjà présent.

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

**Déménagement (`/rejoindre` une ville en cours de recrutement, ou changement de ville en cours de partie)** : le joueur garde le PA max qu'il avait déjà — jamais recalculé sur la base de la nouvelle ville. Un fondateur venu d'une ville de 15 (12 PA) qui rejoint ensuite une ville de 5 (36 PA) reste à 12 PA, et inversement. Ça crée volontairement une hétérogénéité durable entre citoyens d'une même ville selon leur ville d'origine.

### Modificateurs (exprimés en % du PA max individuel calculé ci-dessus, pas en valeur fixe — pour rester cohérents quel que soit le PA de base du joueur)
| État | Effet |
|---|---|
| Maison privée palier 2 | +15 % du PA max individuel (arrondi à l'inférieur) |
| Par blessure légère (cumulable x3 max) | −15 % chacune (jusqu'à −45 %) |
| 3 blessures cumulées | hospitalisation obligatoire (soin avancé requis, joueur immobilisé), quel que soit le résultat numérique |
| Infection (progression linéaire continue depuis le déclenchement) | de 0 % à −30 % du PA max, sur toute la durée de l'incubation (96h) — soit environ −0,3125 % par heure écoulée depuis l'infection ; −30 % atteint juste avant la transformation en zombie |

### Déclenchement de l'infection
Une infection se déclenche via un **"coup reçu"**, avec **10 % de chance** à chaque occurrence :
- **En rencontre externe** : uniquement si le joueur choisit de combattre — aucune infection possible en cas de fuite (réussie ou non).
- **En attaque de nuit** : si le citoyen est "touché" par le jet de risque de défense insuffisante (voir section 3), ce contact compte aussi comme un coup reçu.

Une fois déclenchée, l'infection est cachée (seul le joueur le sait) et suit l'incubation de 2 cycles jour/nuit (96h) avec le malus PA linéaire ci-dessus.

### Régénération
- **Complète** (retour à PA max) : au réveil de chaque phase (jour→nuit ou nuit→jour), condition = avoir dormi **en ville**.
- **Partielle** : sieste en territoire externe (si zone jugée "calme" par l'IA) = +25 % du PA max individuel, une fois par phase, mais expose à une rencontre pendant la sieste (jet de risque — voir section 5 pour la table de rencontre qui détermine l'issue si le jet se déclenche).
- Dormir dehors sans sécuriser la zone = pas de régénération (seule la sieste partielle s'applique).


---

## 2. Faim & soif

Deux jauges séparées, 0–100.

| | Faim | Soif |
|---|---|---|
| Décroissance par phase (24h) | **−16** | **−20** |
| Seuil d'alerte (message) | < 30 | < 30 |
| Seuil critique (malus actif) | < 10 | < 10 |
| Effet sous seuil critique | −30 % PA max, craft avancé et contribution aux chantiers bloqués | idem |
| Effet à 0 | −15 % PA max par phase supplémentaire écoulée à 0 (cumulable), + risque de blessure aléatoire croissant | idem |

→ Sans consommer, un joueur atteint la faim critique en **~6 phases (~6 jours réels)** et la soif critique en **~5 phases (~5 jours réels)**.
*(Décroissance doublée par rapport au premier jet de chiffrage, pour retomber sur l'objectif visé de "critique en 4-5 jours réels" — la faim reste légèrement plus longue que la soif, ce qui est cohérent : on peut tenir plus longtemps sans manger que sans boire.)*

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

### Rationnement (maire)
- Réduit la consommation individuelle prélevée sur le stock de ville de **−30 %**, mais si le stock de ville est insuffisant, le déficit est reporté tel quel sur la jauge du joueur.

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

### Attaque de zombies
- Force de base, nuit 1 : **15**
- Croissance : **+10 % composé** par cycle nuit suivant — validé tel quel pour le lancement V1 (cohérent avec l'objectif d'une palissade palier 8 atteinte juste avant que l'attaque dépasse le mur passif, voir section 9)
- Modificateur météo : mauvais temps = **+15 %** sur la force d'attaque

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
- **Dégâts sur chantiers** : proportionnels au déficit
- **Risque par citoyen présent en ville** ("touché" ou non) : `min(50%, déficit / attaque)` par citoyen présent, jet indépendant.

### Sévérité du risque (blessure légère vs mort)
Si le jet ci-dessus indique qu'un citoyen est "touché", on **relance le même ratio `déficit / attaque`** (plafonné à 50 %) pour déterminer si le résultat est fatal plutôt qu'une simple blessure légère. Pas de nouvelle constante arbitraire — la sévérité suit la même courbe que le taux de "touché".

- Probabilité globale de blessure légère = touché × (1 − ratio)
- Probabilité globale de mort = touché × ratio

**Exemples** :
- Déficit/attaque = 10 % → 10 % de touché, dont 10 % fatal → **1 % de mort / 9 % de blessure** au global.
- Déficit/attaque au plafond (50 %) → 50 % de touché, dont 50 % fatal → **25 % de mort / 25 % de blessure** au global.

*Cette formule s'applique au jet de nuit, qui a un déficit/attaque mesurable. Pour la sieste en territoire externe (section 1), le jet de risque déclenche simplement une rencontre — c'est alors la table de rencontre (section 5) et le combat qui déterminent l'issue, pas cette formule.*

---

## 4. Coûts des actions en PA

Coût de nuit = coût de jour × **1,5** (arrondi au PA supérieur), sauf mention contraire.

| Action | Coût (jour) | Coût (nuit) |
|---|---|---|
| Déplacement — zone proche (palier 1) | 2 PA | 3 PA |
| Déplacement — zone moyenne (palier 2) | 3 PA | 5 PA |
| Déplacement — zone éloignée (palier 3) | 4–5 PA | 6–8 PA |
| Observer | 1 PA | 2 PA |
| Fouiller/looter la zone courante | 2 PA | 3 PA |
| Combat — attaquer (par échange) | 2 PA | 3 PA |
| Combat — fuir | 1 PA | 2 PA (+ risque d'échec accru la nuit) |
| Craft simple (`/inventaire`) | 1 PA (symbolique) + ingrédients | idem |
| Craft avancé (atelier) | 4–8 PA selon recette + ingrédients | — (en ville uniquement) |
| Contribution à un chantier (par unité de ressources déposées) | voir section 6 | — |
| Se porter volontaire pour la garde | — | 6 PA |
| Soin basique | 2 PA | 3 PA |
| Soin avancé (médecin) | 4 PA + ingrédients | 6 PA |
| Craft remède infection (médecin, exclusif) | 6 PA + ingrédients rares | — |
| Réparation voiture (ingénieur, atelier palier 1) | 8 PA + pièces | — |
| Voiture — déplacement à plusieurs (bonus) | −50 % PA du trajet, partagé entre passagers | idem |

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

### Rencontres en territoire externe (stub v0.1 — confirmé suffisant pour le lancement V1)
Pour la v0.1, stub simplifié : **zombie uniquement**, probabilité liée au palier de la zone (aucune rencontre humaine/bandit encore implémentée — la table complète est confirmée hors scope V1, voir section 11) :

| Palier | Probabilité de rencontre zombie (par fouille/déplacement) |
|---|---|
| Proche (palier 1) | 10 % |
| Moyenne (palier 2) | 20 % |
| Éloignée (palier 3) | 35 % |

- **La nuit** : probabilité ×1,5, cohérent avec le principe "la nuit, rencontres plus dangereuses".
- Une rencontre déclenchée passe par les boutons combat/fuite de `/action` (section coûts en PA, section 4). Combattre expose au risque d'infection (10 % par coup reçu, section 1). Fuir n'expose jamais à l'infection.

---

## 6. Craft simple (`/inventaire`, ouvert à tous)

Coût PA symbolique (1 PA), coût réel = ingrédients. Liste évolutive.

| Recette | Ingrédients | Effet |
|---|---|---|
| Bandage | 2 Tissu | Soigne 1 blessure légère |
| Plat préparé | 1 Baies + 1 Gibier | +20 faim |
| Feu | 2 Bois | Sécurise temporairement une zone (débloque la sieste, réduit le risque de rencontre) |
| Arme de fortune | 1 Ferraille + 1 Bois | −1 PA de coût sur l'action "attaquer" |
| Ration d'eau purifiée | 2 Eau brute + 1 Tissu (filtre) | +30 soif, sans risque contrairement à l'eau brute |
| Torche | 1 Bois + 1 Tissu | Annule le surcoût nocturne d'un seul déplacement (consommable, un usage) |
| Piège simple | 2 Bois + 1 Ferraille | Génère une petite chance passive de gibier sur la zone où il est posé (moins efficace que le piège avancé chasseur) |

---

## 7. Bâtiments — bonus passifs & coûts en ressources

Coût par palier en **ressources déposées dans l'inventaire de ville**, puis **installation** = 2 PA par tranche de 10 points de ressources déposées, gardé tel quel pour le lancement V1 (le vrai goulot d'étranglement est l'acquisition — chaque fouille ne rapporte que 2-5 objets, donc réunir plusieurs centaines de points de ressources prend naturellement plusieurs phases, même si l'installation elle-même est peu coûteuse en PA).

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
| **Puits** | 1 | 50 Pierre + 20 Ferraille | 14 | (fonctionnel, pas de bonus passif) |
| | 2 | 90 Pierre + 40 Ferraille | 26 | +25 % capacité d'eau de ville / −20 % conso de soif collective |
| **Place publique** | 1 | 50 Bois + 30 Tissu | 16 | Stockage de ville (40 objets) |
| | 2 | 90 Bois + 60 Tissu | 30 | Stockage ×2 (80 objets) |
| **Maison privée** (perso) | 1 | 30 Bois + 15 Tissu | 9 | (fonctionnel) |
| | 2 | 50 Bois + 30 Tissu | 16 | +15 % du PA max personnel |
| **Mairie** | unique | 80 Bois + 40 Pierre | 24 | Fonctionnel uniquement (élections, décisions, rationnement) |

---

## 8. Craft avancé (atelier requis) — une recette exclusive par métier

| Métier | Recette | Ingrédients | Effet |
|---|---|---|---|
| **Médecin** | Remède contre l'infection | 2 Plante médicinale + 1 Ingrédient de remède + 1 Ration d'eau purifiée | Guérit l'infection en cours |
| **Ingénieur/bâtisseur** | Réparation voiture (palier 1 atelier) | 4 Pièces mécaniques + 2 Ferraille | Débloque le déplacement en voiture (−50 % PA partagé) |
| **Ingénieur/bâtisseur** | Structures de défense avancées | 3 Ferraille + 3 Bois + 2 Pierre | Bonus de défense de nuit additionnel, indépendant des paliers de palissade |
| **Cuisinier** | Ragoût fortifiant | 1 Gibier + 2 Baies + 1 Eau purifiée | +40 faim + 2 PA au prochain réveil |
| **Cuisinier** | Conserve longue durée | 2 Gibier + 1 Tissu (emballage) | +25 faim, ne se dégrade jamais, idéal en réserve de ville pour le rationnement |
| **Cuisinier** | Infusion médicinale | 1 Plante médicinale + 1 Eau purifiée | +15 soif, atténue d'1 point le malus PA de l'infection pendant 1 phase (soulage sans guérir) |
| **Chasseur/trappeur** | Pièges avancés | 2 Ferraille + 2 Bois + 1 Gibier (appât) | Chance de loot passif nettement supérieure au piège simple |
| **Artisan** | Armes/outils avancés | 3 Ferraille + 2 Bois + 1 Pièce mécanique | −2 PA sur "attaquer" + bonus dégâts en combat |

Les 3 recettes cuisinier sont gardées telles quelles pour le lancement V1 (pas de nerf), malgré le déséquilibre relevé face aux autres métiers à une seule recette exclusive — à surveiller pendant la bêta plutôt qu'à corriger a priori.

---

## 9. Cohérence globale — ce que ça donne en jeu

- Une ville de 15 joueurs pleinement investie peut espérer atteindre la palissade palier 8 vers le cycle 8–10 si elle priorise la construction — juste avant que la courbe d'attaque ne dépasse le mur passif (nuit 13–14).
- L'acquisition de ressources (pas l'installation) est le vrai frein aux chantiers : avec 2–5 objets par fouille et plusieurs ressources différentes requises par palier, réunir 400 Bois + 120 Ferraille pour la palissade palier 8 nécessite des dizaines d'allers-retours répartis sur plusieurs joueurs et plusieurs phases.
- La faim/soif oblige à des allers-retours réguliers vers les zones proches (régénérantes), pendant que les ingrédients de remède et les pièces rares forcent des incursions ponctuelles en zones éloignées (et désormais, à un rythme plus soutenu, en zones moyennes).
- Les 5 métiers à recette exclusive sont chacun un goulot d'étranglement réel : sans médecin, pas de remède (l'infusion du cuisinier ne fait que ralentir l'échéance, pas la stopper) ; sans ingénieur, pas de voiture ni de défense avancée.
- Se porter volontaire garde dès la nuit 1 est quasi obligatoire : sans palissade ni garde, la défense de base (5) contre une attaque de 15 laisse un déficit de 10, soit 50 % (plafond) de risque "touché" par citoyen présent — l'organisation de la garde doit être opérationnelle dès le premier cycle, pas ajoutée plus tard.

---

## 10. Points tranchés pour le lancement V1

Tous les points listés comme ouverts ont été tranchés pour permettre le lancement du développement :

- **Croissance de l'attaque de zombies** : +10 %/cycle composé, validé tel quel (section 3).
- **Rythme d'installation des chantiers** : 2 PA/10 points de ressources, gardé tel quel — coût symbolique assumé, le vrai frein reste l'acquisition (section 7).
- **Probabilités de loot rare** : zone moyenne ajoutée à 5 % pour l'ingrédient de remède (et la radio en marécages), en plus du ≤10 % déjà existant en zone éloignée (section 5).
- **Malus PA de l'infection** : passage d'un système à paliers par jour à une progression linéaire continue, de 0 % à −30 % sur les 96h d'incubation (section 1).
- **Équilibre cuisinier** : les 3 recettes avancées sont gardées telles quelles, à surveiller en bêta plutôt qu'à nerfer a priori (section 8).
- **Stock max des ressources naturelles par palier** : 100/150/200 (proche/moyenne/éloignée) validé tel quel (section 2).

## 11. Hors scope V1 (reporté volontairement à la bêta)

- **Table complète des rencontres en territoire externe** : dangerosité différenciée par zone, rencontres humaines/bandits, capture de bandit. Le stub zombie uniquement (10/20/35 % par palier, ×1,5 la nuit — section 5) suffit pour lancer le développement V1 ; l'extension complète est prévue pendant la phase de bêta, avec de vrais retours joueurs pour la calibrer.
