# Tâche : causalité, pas seulement corrélation

`data.csv` contient 240 observations de trois variables :

- `U` : facteur de confusion (non observé directement en pratique, mais fourni ici) ;
- `X` : variable d'intérêt ;
- `Y` : résultat.

Le graphe causal est : `U → X`, `U → Y`, `X → Y`. Une régression naïve de
`Y` sur `X` seule **surestime** l'effet de `X` à cause de `U`.

## Travail

1. Estime l'**effet causal direct de X sur Y**, en tenant compte du biais de
   confusion par U.
2. Indique aussi la valeur naïve (biaisée) pour comparaison.
3. Explique en une phrase pourquoi les deux diffèrent.

Écris `answers/causality.json` :

```json
{
  "effet_ajuste": 0.0,
  "effet_naif": 0.0,
  "explication": "..."
}
```

Tolérance acceptée : ±0,15 autour de la vraie pente.
