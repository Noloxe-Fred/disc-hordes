# Simulateur d'équilibrage

Simule des parties complètes de Disc'Hordes, joueur par joueur et phase par phase, pour tester l'équilibrage avant de le mettre en jeu. C'est l'outil qui a servi au rééquilibrage du 2026-10-10 (méthode et résultats : `docs/equilibrage.md`, section 9).

Python 3, sans dépendance. Le simulateur ne lit pas le code TypeScript : les valeurs de jeu sont recopiées dans `nouvelle.py`, à garder alignées sur `src/config` et `docs/equilibrage.md`.

## Fichiers

- `sim.py` : le moteur. Il couvre les expéditions (choix de zone, trajets, fouilles, sac, stocks partagés), les rencontres, les fuites et les joueurs coincés dehors, la horde, l'attaque de la ville, la garde, les PV, les soins, l'infection, la faim et la soif, le puits, la banque, les crafts, les chantiers et les maisons. `cfg_premier_jet()` contient les valeurs d'avant le rééquilibrage. Les niveaux d'organisation simulés (`QUAL`) sont `excellente`, `bonne`, `moyenne` et `faible`.
- `nouvelle.py` : les configurations successives du rééquilibrage (`cfg_v1` à `cfg_v6`). **`cfg_finale()` contient les valeurs en jeu.**
- `finale.py` : la matrice complète (villes de 15, 10, 7 et 5 joueurs × 4 organisations, groupe de 3 villes, comparaison avec le premier jet).
- `ablation.py` : remet une à une les valeurs du premier jet et mesure l'effet de chaque changement.

## Utilisation

Depuis ce dossier :

```
python finale.py
python ablation.py "PA 180" "sac 12"
```

Pour tester une variante, `nouvelle.cfg_finale(cle=valeur)` remplace n'importe quelle valeur, par exemple `cfg_finale(pa_cible=240, faim=14)`. `appliquer_inst` recalcule ensuite les PA d'installation à partir des ressources. Puis :

```python
import nouvelle, sim
out, _ = sim.stats(nouvelle.cfg_finale(att_croiss=.12), [(15, 'bonne')], runs=20)
sim.afficher('essai', out)
```

## Indicateurs

Chaque ligne affiche des médianes sur toutes les parties simulées :

- `percee` : première nuit après le cycle 3 où l'attaque dépasse la défense de plus de 15 %.
- `moitie` : cycle où la moitié des fondateurs est morte.
- `chute` : cycle où meurt le dernier survivant.
- `morts<=10` et `<=15` : nombre moyen de morts avant ces cycles.
- `palis@10` et `@15` : palier de palissade atteint.

## Limites

Les joueurs simulés fuient toujours (ils n'utilisent ni armes, ni pièges, ni voiture, ni tir), fabriquent peu de structures et ne se coordonnent pas comme des humains. Une partie dure environ 0,1 s. Compter 20 à 30 parties par cas pour lisser le hasard : il reste environ ±1 cycle de bruit.
