# Natural Search Control Plane

- **Statut** : Phases 1–10 intégrées et testées.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/adr/0032-natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-22.
- **Jeu de tests** : `npm --prefix backend run test:natural-search` lance `test_natural_search_controller.js` (Controller + hystérésis), `test_natural_search_runtime_e2e.js` (LED, Controller, Actuator, Persistence SQLite en mémoire) et `test_natural_search_e2e_pipeline.js` (pipeline réel `checkNaturalSearchControl()` avec DB SQLite). Tous passent. Le `run_validation_suite.js profile=smoke` exécute les 4 suites Natural Search.

## État d'implémentation

| Composant | Statut | Fichier | Intégration pipeline |
| --- | --- | --- | --- |
| Causal Progress Sensor | ✅ | `causalProgressService.js` | ✅ via `checkNaturalSearchControl()` |
| Entropy×Progression Classifier | ✅ | `entropyProgressClassifier.js` | ✅ |
| Hypothesis Ledger | ✅ | `hypothesisLedgerService.js` | ✅ |
| Search Pressure Model | ✅ | `searchPressureService.js` | ✅ |
| Natural Search Controller | ✅ | `naturalSearchController.js` | ✅ hystérésis + PROCESS_LEVEL |
| Natural Search Actuator | ✅ | `naturalSearchActuatorService.js` | ✅ primitives GenOS réelles (PLASTICITE/CLONAL/SPECIATION/REPLAY_CAUSAL/EVOLUTION) |
| SearchReceipt | ✅ | `SearchReceipt.js` | ✅ |
| Runtime Integration | ✅ | `agentProcessEventPipeline.js` | ✅ via `checkNaturalSearchControl()` |
| Persistance SQLite | ✅ | `searchPersistenceService.js` | ✅ `saveHypothesis`/`saveProof`/`savePressure`/`saveDecision` (API async `sqlite`) |
| E2E — composants isolés | ✅ | `test_natural_search_runtime_e2e.js` | ✅ |
| E2E — pipeline `checkNaturalSearchControl()` | ✅ | `test_natural_search_e2e_pipeline.js` | ✅ appelle `checkNaturalSearchControl()` avec DB SQLite réelle |
| `test_search_evolution.js` | ✅ | `test_search_evolution.js` | ✅ EVOLUTION process + actuator cohérents |
| SearchGenome | ⚠️ module isolé | `searchGenomeService.js` | ❌ non consommé par l'Actuator |
| Cognitive Affinity | ⚠️ module isolé | `cognitiveAffinityService.js` | ❌ non branché |
| Generalized Foraging | ⚠️ module isolé | `searchPatchService.js` | ❌ non appelé par `forage()` de l'Actuator |
| Causal Replay Service | ⚠️ module isolé | `causalReplayService.js` | ❌ non consommé par l'Actuator |
| Negative Search Memory | ⚠️ module isolé | `negativeSearchMemoryService.js` | ❌ non branché |
| Search Evolution | ⚠️ module isolé | `searchEvolutionService.js` | ❌ non consommé par l'Actuator |
| Cultural Transmission | ⚠️ module isolé | `searchCultureService.js` | ❌ non branché |

## Architecture finale

```
Event (AGENT_STEP / EVIDENCE_REPORT / AGENT_FAILED)
  ↓
agentProcessEventPipeline.processEventQueueImpl()
  ↓
checkNaturalSearchControl(ctx, event)
  ├─ CausalProgressService.ingestEvent()
  ├─ HypothesisLedger.addEvidence() / propose()   ← PROVENANCE forcé à SELF_REPORTED par le runtime
  ├─ NaturalSearchController.selectProcess()
  │    └─ PROCESS_LEVEL (CONTINUE=0 … EVOLUTION=6)
  │    └─ Hystérésis : blocage downgrade uniquement, escalation toujours autorisée
  ├─ NaturalSearchActuator.execute()
  │    ├─ FORAGE           → logique interne (pas searchPatchService)
  │    ├─ PLASTICITE       → applySnapshotState (DB)
  │    ├─ CLONAL_AFFINITY_SEARCH → lineageController.cloneFromAgent (DB)
  │    ├─ STRESS_HYPERMUTATION   → mutateGenome (mémoire)
  │    ├─ SPECIATION             → cloneFromAgent + INSERT niches (DB)
  │    ├─ EVOLUTION              → cloneFromAgent (DB)
  │    ├─ REPLAY_CAUSAL          → applySnapshotState (DB)
  │    └─ CONTINUE               → no-op
  └─ SearchPersistence.saveHypothesis/saveDecision/savePressureState()
```

## Points d'audit résolus

| Point | Description | Statut |
| --- | --- | --- |
| 1 | Hystérésis : mapping PHASE_EXIT + logique hold | ✅ corrigé |
| 2 | Actuator : enum EVOLUTION + méthodes *Sync | ✅ corrigé |
| 3 | Hypothèses à partir d'événements runtime (`maybeProposeHypothesis`) | ✅ implémenté |
| 4 | Preuve → hypothèse par `hypothesisId` (rejet preuve sans ID + falsifiée) | ✅ implémenté |
| 5 | `executeProcess({selection, searchCtx, actuator})` + `searchCtx` transmis | ✅ corrigé |
| 6 | Source unique `searchProcessTypes.js` | ✅ implémenté |
| 7 | Actuator → primitives GenOS réelles (PLASTICITE/CLONAL/SPECIATION/REPLAY_CAUSAL/EVOLUTION) | ✅ terminé |
| 8 | Persistence SQLite opérationnelle (API async `sqlite`) | ✅ implémenté |
| 9 | E2E pipeline `checkNaturalSearchControl()` avec vraie DB SQLite | ✅ implémenté |
| 10 | Docs/code synchronisées + `run_validation_suite.js` | ✅ cette révision |

### Correctifs P0/P1 livrés le 2026-09-22

- **`ledger.PROVENANCE → undefined`** : `naturalSearchRuntime.js` importait `HypothesisLedger, HYPOTHESIS_STATUS` depuis `hypothesisLedgerService` mais utilisait `ledger.PROVENANCE.SELF_REPORTED`. Correction : import explicite `{ HypothesisLedger, HYPOTHESIS_STATUS, PROVENANCE }` et usage de `PROVENANCE.SELF_REPORTED`. Le runtime force `SELF_REPORTED` pour toute preuve injectée via `ingestEvidence`.
- **Hystérésis inversée (escalade bloquée)** : l'ancienne logique faisait `holdProcess = true` quand `p >= PHASE_ENTER[lastProcess]`, ce qui bloquait toute montée. Correction : `PROCESS_LEVEL` explicite + hystérésis uniquement sur `desiredLevel < currentLevel`.
- **`stepsSinceChange` ne reset pas** : incrémenté dans tous les cas sans reset au changement de processus. Correction : reset à 0 quand `process !== this.lastProcess`, incrémente sinon.
- **Actuator `EVOLUTION` manquant** : l'Actuateur n'exportait pas `EVOLUTION` dans son `SEARCH_PROCESS` local. L'Actuator utilise désormais `searchProcessTypes.js` comme source unique.
- **`executeProcess` sans agentId** : `searchCtx.agentId` requis, sinon log + retour null.
- **Path `../../db` vs `../db`** : le chemin relatif correct depuis `services/search/` vers `db/` est `../../db`.

## Limitations connues

- **Actuator** : FORAGE, STRESS_HYPERMUTATION restent déclaratifs (objets en mémoire). FORAGE n'utilise pas `searchPatchService.js`, STRESS_HYPERMUTATION n'utilise pas `searchGenomeService.js`, EVOLUTION ne consomme pas `searchEvolutionService.js`. L'Actuator muté/évolue son propre état interne.
- **Persistence SQLite** : `SearchPersistence` existe et `naturalSearchRuntime.js` l'appelle dans `persistSearchState()`. Mais `clearSearchState(agentId)` à la fin de `handleChildClose` dans `agentProcessEventPipeline.js` détruit l'état mémoire sans flush garanti. La persistance est donc utilisée, mais non critique — les appels sont en `try/catch` silencieux.
- **Provenance uniforme** : le runtime force `SELF_REPORTED` pour toute preuve. Il n'existe pas encore de routage `LLM→SELF_REPORTED / runtime→INFERRED / tool→OBSERVED / verifier→VERIFIED`.

## Principe fondamental

> **Nature is not a database of solutions. Nature is a collection of search processes.**

$$\boxed{
\text{Observe}
\rightarrow
\text{Measure progress}
\rightarrow
\text{Sense pressure}
\rightarrow
\text{Change search process}
\rightarrow
\text{Test}
\rightarrow
\text{Remember}
}$$

## Références biologiques

1. Spiro, Parkinson & Othmer 1997 — chemotaxie bactérienne
2. Schwab, Casasa & Moczek 2019 — plasticité développementale
3. Foster 2007 — mutagenèse de stress
4. Bowers, Boyle & Damoiseaux 2018 — maturation d'affinité
