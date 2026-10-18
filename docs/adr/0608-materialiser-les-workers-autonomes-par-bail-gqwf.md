# ADR 0608 — Matérialiser les workers autonomes par bail GQWF

- **Statut** : Accepté, activation explicite
- **Date** : 2026-10-18
- **Domaine** : Workspaces, workers autonomes, GQWF

## Contexte

Le premier raccordement des workers à GQWF créait encore une capsule physique,
puis l'importait dans une vue durable. La tranche 2 a supprimé cette copie
préalable pour les missions orchestrateur supervisées, mais pas pour leurs
workers autonomes. Ceux-ci payaient donc encore le coût d'un worktree ou d'une
copie complète avant d'obtenir leur vue.

Le runtime et les contrôles d'autorité exigent néanmoins un chemin distinct,
privé, possédé par le worker et vérifiable avant toute délégation.

## Décision

Un worker autonome supervisé dont la mission demande
`executionPolicy.gqwfV2: true` importe la racine visible de son parent, crée une
vue privée, puis matérialise directement cette racine sous un bail GQWF. Il ne
crée plus de worktree ni de copie intermédiaire. Si le parent s'exécute déjà
dans une vue GQWF, cette vue matérialisée est la source du worker.

Le binding durable conserve le bail et le backend. Le marqueur
`.genos-gqwf-lease`, recoupé avec les tables `gqwf_worker_bindings` et
`gqwf_leases`, devient la preuve de possession utilisée par l'autorité du
workspace worker. Le payload porte `workspaceBackend: gqwf-worker` afin que le
runtime ne crée pas une seconde session GQWF imbriquée.

À la clôture réussie, les fichiers sont capturés comme racine candidate, puis le
bail est libéré. Après échec, le bail est libéré sans capture. Une erreur de
capture ou de libération reste persistée et conserve le bail pour reprise. La
candidate n'est jamais publiée automatiquement.

Les workers natifs déterministes, locaux, in-process, les cohortes de plus de
douze workers et les missions non opt-in gardent le parcours physique.

## Conséquences

- La capsule physique préalable disparaît du parcours worker supervisé opt-in.
- Les vues des workers héritent exactement de la projection courante du parent.
- La libération est idempotente et les échecs de dispatch peuvent abandonner le
  bail sans attendre le démarrage d'un processus.
- La projection reste limitée à la politique GQWF ; aucun gain de performance
  n'est affirmé sans benchmark.

## Validation

`node backend/tests/test_gqwf_worker_execution.js`

`node backend/tests/test_gqwf_fabric.js`

`node backend/tests/test_worker_workspace_binding.js`
