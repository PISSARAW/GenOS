# Adaptation des workers déterministes

Le `adaptive_worker` natif accepte actuellement la stratégie `controlled_probe`.
Chaque essai exécute la procédure LPT enregistrée sur le même problème; il mesure
le résultat et produit un reçu. Répéter cette sonde ne constitue pas un changement
de stratégie.

Le runtime refuse donc les stratégies déclarées mais non exécutées, dont
`causal_bisection`. La trace marque chaque sonde comme `retained` et précise que
la stratégie est restée inchangée. Un changement ne pourra être annoncé qu'après
l'enregistrement d'une implémentation distincte, de ses mesures et de ses reçus.

```mermaid
flowchart LR
    A[Contrat adapt_procedure] --> B{Stratégie implémentée ?}
    B -->|controlled_probe| C[Valider mêmes entrées]
    B -->|autre| D[Refuser le contrat]
    C --> E[Exécuter LPT borné]
    E --> F[Receipt et résultat mesuré]
    F --> G[Trace : stratégie retenue]
```

Cette procédure démontre seulement une ou plusieurs exécutions déterministes LPT
bornées. Elle ne démontre ni une recherche de stratégie, ni une bissection
causale, ni une amélioration adaptative.
