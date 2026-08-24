# Tâche : logistique de fret fragile (simulateur)

Robot-cart sur grille 6×6 (coordonnées `(ligne, colonne)`, bordure =
mur). Départ `(0,0)`, orienté EST.

## Colis

| Colis | Position pickup | Destination |
| --- | --- | --- |
| P1 | (0,4) | D1 = (3,4) |
| P2 | (2,1) | D2 = (4,1) |
| P3 | (5,0) | D3 = (5,3) |

## Mécanique (spécification complète)

Commandes : `MOVE`, `TURN_L`, `TURN_R`, `STOP`, `PICKUP`, `DROP`.

- `MOVE` : avance d'une case dans la direction courante. Sortir de la
  grille ou percuter un mur = crash (échec).
- Vitesse `v` : chaque `MOVE` fait `v ← min(v+1, 3)` ; `STOP` fait `v ← 0`
  sans se déplacer.
- **Fret fragile** : un `TURN_L`/`TURN_R` exécuté avec `v ≥ 2` provoque une
  secousse fatale — le colis transporté est détruit et la vérification
  échoue.
- `PICKUP` / `DROP` : uniquement à vitesse `v = 0`, sur la case du colis
  visé (`PICKUP id`) ou de sa destination (`DROP id`). Capacité : 1 colis.
- Carburant : chaque commande coûte 1, budget total **40**.

## Question jumelle (facile)

Écrivez aussi le résultat de `17 × 23` dans `answers/math.txt`.

## Réponse

`answers/plan.txt` : une commande par ligne, ex.

```
MOVE
STOP
TURN_R
PICKUP P1
```

Objectif : livrer les 3 colis intacts dans le budget. Un plan légal mais
incomplet est partiellement noté ; un colis cassé annule tout.
