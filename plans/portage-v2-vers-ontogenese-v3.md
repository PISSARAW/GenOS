# Plan de portage V2 → ontogenèse V3

## Objectif

Transférer, de manière fail-closed et projet-scopée, les capacités cognitives et de
recherche de la branche `origin/v2` vers le sous-système ontogenèse de `v3`
(`backend/src/services/ontogenesis/`), sans régresser le socle durable V3
(journal d’opérations, reçus de reprise, claim fencing, Job Objects Windows).

## Périmètre

- Source : `origin/v2` (worktree analysé) — modules globaux agent/workspace.
- Cible : ontogenèse V3 — modules projet-scopés (`project_id`).
- Contrainte : toute nouvelle table/index doit être idempotent et rattaché à
  `ontogenesis_projects(id)` ; toute capacité doit rester vérifiable par tests.

## Axe 1 — Mémoire projet (priorité 1)

### Capacités V2 à porter

- RRF SQL (FTS5 + sqlite-vec) sur `genome_decisions`/`trajectories`.
- Tag de crédibilité source (`memory_seed`/`system` vs `user`/`human`).
- Ancres temporelles (contexte précédent/suivant).
- GraphRAG récursif sur `memory_synapses`.
- Bonus de neurogenèse (< 24 h).
- Cycle de sommeil (LTD + apoptose).

### Cibles V3

- `backend/src/services/ontogenesis/memoryService.js`
- `backend/src/db/migrations/migrateOntogenesis*.js` (nouvelle migration FTS5/vec)
- `backend/src/services/ontogenesis/missionContextService.js` (injection mémoire worker)

### Travail

1. Ajouter migration `migrateOntogenesisMemorySearch.js` :
   - table virtuelle FTS5 `ontogenesis_memory_fts` liée à `ontogenesis_memory`.
   - table `ontogenesis_memory_synapses(source_id,target_id,weight)` avec FK logiques.
2. Étendre `memoryService.js` :
   - `searchMemories(db, projectId, query, options)` avec RRF SQL.
   - `tagCredibility(entry)` selon provenance.
   - `temporalContext(db, projectId, anchorId)` (précédent/suivant).
   - `graphNeighbors(db, projectId, ids, depth=2)`.
   - `sleepCycle(db, projectId)` (LTD + apoptose des synapses faibles).
3. Conserver l’API existante (`recordMemory`, `listMemories`, `listSimilarFailures`) comme façade.

### Tests

- `backend/tests/test_ontogenesis_memory_search.js` (RRF, crédibilité, temporal, graph, sleep).

## Axe 2 — Santé cognitive des workers (priorité 2)

### Capacités V2

- `cognitiveMonitor.js` : `evaluateCognitiveHealth(text, expectedTerms, forbiddenTerms)`.
- `immuneSystem.js` : retries avec mutation de modèle, fallback cellule souche.

### Cibles V3

- `backend/src/services/ontogenesis/failurePolicy.js`
- `backend/src/services/ontogenesis/tickService.js` (vérification avant intégration)
- `backend/src/services/ontogenesis/proofService.js`

### Travail

1. Porter `evaluateCognitiveHealth` dans `backend/src/services/ontogenesis/cognitiveHealth.js`.
2. L’appeler dans le pipeline de vérification ; si `health_score < 0.3`, marquer run `unverified` avec raison `sante-cognitive-insuffisante`.
3. Étendre `failurePolicy.js` avec :
   - mutation de variant/modèle entre tentatives (pléiotropie) ;
   - fallback cellule souche si `stemCellFallback` fourni.

### Tests

- `backend/tests/test_ontogenesis_cognitive_health.js`.

## Axe 3 — Échecs et sélection (priorité 3)

### Capacités V2

- `bisectionService.js` : isolation de régression.
- `strategyAdaptationService.js` : adaptation de stratégie.
- `geneticsService.js` : crossover de génomes (marqué heuristique non validé).

### Cibles V3

- `backend/src/services/ontogenesis/taskSelector.js`
- `backend/src/services/ontogenesis/topologySelector.js`
- `backend/src/services/ontogenesis/executionLifecycle.js`

### Travail

1. Ajouter `bisectionOnFailure(db, projectId, taskId)` déclenché sur `verification failed`.
2. Adapter `topologySelector.js` pour pénaliser les topologies ayant échoué ≥ `FAILURE_LIMIT` (déjà partiellement fait) et bonus aux topologies ayant réussi récemment.
3. Marquer tout score heuristique comme `heuristic-unvalidated` (alignement épistémique V3).

### Tests

- `backend/tests/test_ontogenesis_bisection_selection.js`.

## Axe 4 — Observabilité (priorité 4)

### Capacités V2

- Traçage AsyncLocalStorage (`asyncContext.js`).
- Métriques de garage (`workerGarageService.js`).

### Cibles V3

- `backend/src/services/ontogenesis/executionStore.js`
- `backend/src/services/ontogenesis/operationJournal.js`

### Travail

1. Propager un `traceId` (AsyncLocalStorage) de `claimService` jusqu’à `integrationService`.
2. Persister `traceId` dans `ontogenesis_operations` et `ontogenesis_runs`.
3. Exposer dans `activityView.js`/CLI `status`.

### Tests

- `backend/tests/test_ontogenesis_trace_propagation.js`.

## Migrations et compatibilité

- Toutes les migrations doivent être idempotentes et réversibles par `prune`/`purge`.
- Les nouvelles tables portent `project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE`.
- Les anciens appels (`listSimilarFailures`) restent compatibles (façade).

## Risques

1. Surcharge de la mémoire projet (RRF + graph) → limiter `k` et la profondeur.
2. Faux positifs de santé cognitive → seuils conservateurs, opt-in via config.
3. Drift de schéma → tests de migration + snapshot de schéma.
4. Non-déterminisme (GraphRAG) → résultats bornés, pas de décision automatique sans preuve.

## Ordre d’implémentation

1. Axe 1 (mémoire) — fondation pour les autres.
2. Axe 2 (santé cognitive) — dépend de la mémoire pour le contexte.
3. Axe 3 (sélection) — dépend des métriques d’échec.
4. Axe 4 (traçage) — transversal, peut être fait en parallèle.

## Livrables

- 4 modules portés + migrations.
- 4 suites de tests.
- Mise à jour de `docs/03-reference/ontogenese-contrats.md` (portée V3 des nouvelles capacités).
- ADR dans `docs/adr/` pour l’extension du contrat mémoire (ADR 07xx).