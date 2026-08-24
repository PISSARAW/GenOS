# T2 — Plus court chemin pondéré

Grille 20×20 (`grid.json`) : `entry_costs[r][c]` = coût payé en entrant dans
la case ; `walls` = cases infranchissables. Départ (0,0) — la case de départ
ne coûte rien. Objectif (19,19). Déplacements 4-directionnels.

Donnez le **coût optimal exact**.

## Réponse

`answers/route.json` :

```json
{ "optimal_cost": 0 }
```

Un seul entier. Le grader recalcule l'optimum et compare.
