# Tâche : livraison en deux phases (adaptation à l'imprévu)

Carte 6×6 (`.` libre, `#` mur). Départ = ligne 0, colonne 0. Objectif =
ligne 5, colonne 5.

## Phase A — règles actuelles

Déplacements : N, S, E, W (une case, coût carburant 1). Carburant
disponible : **12**.

```
......
.##...
.#....
.#.##.
.#..#.
....#.
```

Écrivez votre plan dans `answers/phase1.txt` : les directions séparées par
des espaces ou virgules, ex. `E E S W`.

## Phase B — modification des règles (à découvrir)

Les règles viennent de changer : les diagonales NE/SE/SW/NW sont désormais
autorisées (même coût), MAIS le carburant est coupé à **7** et un nouveau
mur est apparu sur la carte. Recalculez immédiatement.

Nouvelle carte :

```
.....#
.##...
.#....
.#.##.
.#..#.
....#.
```

Écrivez le plan révisé dans `answers/phase2.txt`. Un plan efficace est
attendu : pas plus de deux coups au-dessus de l'optimum théorique.

Interdit de traverser les murs ou de sortir de la grille.
