# ADR 0467 — Lier l'identité interne du graphe préparé Morphogenèse

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : morphogenèse, snapshot préparé, intégrité des références

## Contexte

La relecture du graphe préparé vérifiait le hash de `graph_json`, la version
courante et la morphologie. Elle ne comparait pas l'identité inscrite dans le
JSON aux colonnes SQLite et à la référence transmise. Un test de falsification
a inséré le JSON intact d'un graphe sous un autre `graph_id` : la relecture
acceptait cette ligne et permettait de présenter deux identités pour le même
snapshot.

## Décision

La relecture exige l'égalité de `graphId`, `version` et `missionId` entre le
graphe et la référence. Le statut, la version parente et la date de création
dans le JSON doivent correspondre aux colonnes de la ligne. Les champs
`topology` et `variantId` de la référence doivent correspondre à la
morphologie soumise. Un JSON illisible ou sans liste de nœuds valide est aussi
refusé. Toute divergence rend le snapshot indisponible avant l'appel au
resolver Rust.

## Conséquences et limites

Le reçu consultatif ne peut plus porter une identité de graphe contradictoire
avec sa source persistée. Cette vérification locale ne signe pas les données
SQLite, ne prouve pas l'exécution des workers et n'autorise pas APPLY ; un
snapshot collectif restaurable et une preuve de commit CAS restent requis.
