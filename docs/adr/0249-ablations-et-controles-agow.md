# ADR 0249 — Conditions d'ablation AGOW étendues

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, expérimentation, falsification
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0007, ADR 0240–0248

## Contexte

Le runner expérimental AGOW offre déjà des exécutions isolées à callbacks, mais ses
conditions par défaut ne couvrent que le workspace, le broadcast et quelques organes.
Les nouveaux mécanismes ont besoin d'expériences comparables.

## Décision

Ajouter les conditions d'ablation regret, allostase, contrefactuel, Active Query,
plasticité rapide, voies directes, procéduralisation, décompilation, marchés distribués
et provenance. Le runner continue de transmettre l'étiquette de condition à l'adaptateur
de tâche; celui-ci doit désactiver le mécanisme nommé et documenter comment il l'a fait.
Le runner conserve le même snapshot initial, manifeste, seeds, tâches et budget du
protocole. Il ne déclare pas qu'une condition a réellement désactivé le mécanisme sans
instrumentation de l'adaptateur.

## Conséquences

### Positives

- La feuille de route expérimentale couvre ses mécanismes distincts.
- Les conditions peuvent être évaluées par paires à partir du même protocole.

### Négatives

- Les effets causaux dépendent toujours de l'adaptateur et du contrôle expérimental.
- Les étiquettes ne créent pas de holdout ni de réplication indépendants.

## Alternatives

- Générer des reçus d'ablation automatiques sans contrôler le runtime : rejeté, car cela
  revendiquerait des interventions non exécutées.
