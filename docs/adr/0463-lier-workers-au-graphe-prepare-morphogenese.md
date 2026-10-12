# ADR 0463 — Lier les workers au graphe préparé Morphogenèse

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : morphogenèse, preuve consultative, graphe préparé

## Contexte

Le graphe préparé persistait la liste des workers dans son nœud racine, mais
`readBoundSnapshot` ne comparait que la topologie et le variant à la
morphologie passée à l'adjudication. Une liste de workers différente pouvait
donc recevoir une décision Rust consultative liée à l'empreinte du graphe
initial. Le test de falsification obtenait un graphe malgré un rôle de worker
modifié après scellement.

## Décision

La relecture exige l'égalité structurelle de la liste des workers avec celle
du nœud racine persisté, après normalisation JSON identique à la persistance.
Une liste absente dans le graphe, mal formée ou différente rend le snapshot
indisponible avant l'appel au resolver Rust. L'adjudication renvoie
`SNAPSHOT_STALE_OR_MISMATCHED` sans produire de proposition consultative.

## Limites

Cette liaison protège la proposition de structure préparée. Elle ne prouve ni
l'exécution des workers, ni leur identité runtime, ni une transition
restaurable. La décision demeure consultative et APPLY reste fermé.
