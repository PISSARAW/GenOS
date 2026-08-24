# Tâche : fenêtre de force de préhension

Une pince à deux manteaux parallèles saisit des objets pour les soulever
avec une accélération verticale `a = 2 m/s²`. Chaque manteau exerce une
force normale `F` (la même des deux côtés). Physique imposée :

- Adhérence : la friction totale maximale vaut `2 · μ · F`
  (deux contacts, coefficient μ chacun).
- Condition de tenue : `2μF ≥ m(g + a)` avec `g = 9.81`.
- Écrasement : l'objet est détruit si `F > 400 · m`.

Pour chaque objet, donnez une force `F` entière (newtons) dans la fenêtre
sûre `[⌈besoin⌉, 400·m]`, ou la chaîne `"impossible"` si aucune force ne
fonctionne.

| Objet | masse m (kg) | μ |
| --- | --- | --- |
| o1 | 2 | 0.5 |
| o2 | 0.1 | 0.25 |
| o3 | 5 | 0.8 |
| o4 | 3 | 0.02 |
| o5 | 10 | 0.005 |
| o6 | 1 | 0.1 |

## Réponse

`answers/grip.json` :

```json
{ "o1": 0, "o2": 0, "o3": 0, "o4": 0, "o5": "?", "o6": 0 }
```

(`"impossible"` n'est acceptable que si la fenêtre est vide — pas si vous
n'avez pas calculé.)
