# Lot morphogenesis — 71 services sans import littéral

Statut : enquête 2026-09-27, méthode `audit_service_reachability.js` + `rg` sur `backend/src`, `backend/bin`, `mcp`, `backend/tests`.
Verdict global : **aucun des 71 n'est appelé en production** (ni littéral, ni dynamique, ni registre). 12 test-only, 6 bibliothèques, 53 orphelins stricts.

## 1. Parcours réel du noyau actif (hors lot, référence)

Le moteur qui fonctionne ne passe pas par ces 71 fichiers :
entrée `compileExpression` (`graph/morphologyCompiler.js`) → validation (`graph/morphologyGraphValidator.js`)
→ exécution `MorphologyRuntime` (`runtime/morphologyRuntime.js` + `runtime/operators/*`)
→ plugins `installTopologyPlugins` (`runtime/topologyPlugins.js`)
→ reçus par nœud (`GATE/PARALLEL/SEQUENCE/TOPOLOGY`) + dossiers d'evidence.
Preuve : `node backend/tests/test_morphology_graph_execution.js` → `passed` (sans stubs, sans SQLite), relancé le 2026-09-27.
Refus déjà couverts par le protocole des gates : op inconnue `TELEPORT` refusée, `BRIDGE` à contrat violé refusé fermé, topologie inconnue `not registered`.

## 2. Classification des 71

**Legacy à marquer obsolète (8)** : `composition/bridgeOperator, competeOperator, federateOperator, gateOperator, nestOperator, parallelOperator, sequenceOperator, wrapOperator`
— tous ne font que `require('./compositionRuntime')`, doublons de `runtime/operators/*Executor` utilisés par le runtime et le gate A. Aucun appelant prod ou test.

**Test-only (12)** : `benchmark/morphologyMetrics`, `benchmark/nonStationaryBenchmark` (via `test_morphogenesis_benchmark.js`),
`control/localFirstMorphogenesisService`, `genome/morphologyConstitution`, `health/morphologicalNecessityService`,
`pruning/morphologyPruner`, `transitions/localMorphogenesisController`, `transitions/workerMorphologyMigrationService`
(via `test_morphogenesis_invariants.js`), `graph/morphologyGraphStore` (via `test_morphology_graph_store_cas.js`),
`runtime/topologyPlugins` (via `test_morphology_graph_execution.js` — donc pont prod→topologies non chaîné hors test),
`plasmidResolverService` (via `test_plasmid_lifecycle.js` — voir correction matrice §5).

**Bibliothèque, non requise (6)** : `control/index`, `controllers/index`, `learning/index`, `runtime/index`, `synthesis/index`,
`transitions/index`, `variants/index` — barrels que la prod contourne en requérant les modules directs.

**Orphelins stricts (53, extraits)** : `adapters/*` (3), `boundaries/*` (2), `causalLoopService`, `counterfactualComparison/Experiments/Interventions`,
`decisionObservabilityService`, `epidemiology/*` (4), `evaluation/*` (3), `firewalls/informationFirewallManager`,
`genome/morphologyGenome`, `health/dette+stress`, `memory/*` (6), `ncePoetMorphologyAdapter`, `plasmidDnaBridgeService`,
`profiling/*` (3), `pruning/dormant+compactor+subtreeApoptosis`, `recovery/morphologyRegenerationService`,
`relations/relationGraphRegistry`, `runtime/morphogenesisReceiptService + morphologyObservabilityService`,
`subgraphTopologyService`, `synthesis/morphologyPatternService + morphologySearchPolicy`, `weaknessCompensationResolver`.

## 3. Décision

- `composition/*` : statut proposé `obsolète` (remplacé par `runtime/operators/*`, preuve : gate A sans eux).
- Barrels : statut `bibliothèque`, à documenter comme tels, pas à câbler.
- 53 orphelins : statut `à classer` → `expérimental` ou `obsolète` au cas par cas ; **aucun appel artificiel ajouté pour le compteur**.
- `runtime/topologyPlugins.installTopologyPlugins` : seul point d'injection des 8 topologies, appelé uniquement par le test
  (`test_morphology_graph_execution.js:7,31,69`) ; le chaînage prod du dispatch topologique reste à prouver (étape 3, boucle causale).
