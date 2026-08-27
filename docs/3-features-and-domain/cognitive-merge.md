# Cognitive Merge (Fusion Cognitive)

La fonction de **Cognitive Merge** dans GenOS transcende la simple fusion de code. L'opération `genos merge` construit et intègre un graphe complet comprenant les observations, actions, résultats, échecs, découvertes, et changements de croyances des agents.

## Capacités Principales

- **Réconciliation de Preuves** : Le système est capable de comparer des trajectoires conflictuelles et de transférer les découvertes valides vers un *snapshot* parent vierge.
- **Résolution des Conflits Contextuels** : GenOS conserve les conclusions "disputées" (par exemple : choix entre Redis ou Postgres) sous forme contextuelle sans écraser la mémoire des branches ni polluer les hypothèses éliminées.
- **Graphe Cognitif** : Toutes les informations sont traçables et justifiées, formant un graphe d'actions et de réactions qui garantit une fusion intelligente des solutions.

## Interface CLI

Pour fusionner une branche avec des conditions spécifiques :

```bash
genos merge <branch_id> --conditions "<conditions_de_fusion>"
```

## Intégration MCP

L'outil `genos_merge` est disponible pour les agents, leur permettant de résoudre conditionnellement des conflits de branches tout en préservant le contexte cognitif de chaque univers simulé.
