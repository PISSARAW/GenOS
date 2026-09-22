# Natural Search Control Plane

- **Statut** : Phases 1–5 implémentées et couvertes par les tests. Phases 6–12 : composants prototypes présents, intégration complète aux primitives runtime non démontrée. Persistance SQLite : service implémenté, non intégré au cycle runtime.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/adr/0032-natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-22.
- **Jeu de tests** : `npm --prefix backend run test:natural-search` lance `test_natural_search_controller.js` (Controller seul + hystérésis mockée) et `test_natural_search_runtime_e2e.js` (LED, Controller, Actuator, Persistence SQLite en mémoire, instanciation directe des composants — pas `agentProcessEventPipeline`).

## État d'implémentation

|| Composant | Statut | Fichier | Intégration pipeline |
|| --- | --- | --- | --- |
|| Causal Progress Sensor | ✅ | `causalProgressService.js` | ✅ via `checkNaturalSearchControl()` |
|| Entropy×Progression Classifier | ✅ | `entropyProgressClassifier.js` | ✅ |
|| Hypothesis Ledger | ✅ | `hypothesisLedgerService.js` | ✅ |
|| Search Pressure Model | ✅ | `searchPressureService.js` | ✅ |
|| Natural Search Controller | ✅ | `naturalSearchController.js` | ✅ hystérésis + PROCESS_LEVEL |
|| Natural Search Actuator | ⚠️ partiel | `naturalSearchActuatorService.js` | ✅ primitives GenOS réelles pour PLASTICITE/CLONAL/SPECIATION/REPLAY_CAUSAL seulement — voir limitations |
|| SearchReceipt | ✅ | `SearchReceipt.js` | ✅ |
|| Runtime Integration | ✅ | `agentProcessEventPipeline.js` | ✅ via `checkNaturalSearchControl()` |
|| Persistance SQLite | ✅ | `searchPersistenceService.js` | ✅ `saveHypothesis`/`saveProof`/`savePressure`/`saveDecision` (API async `sqlite`) |
| E2E — composants isolés | ✅ | `test_natural_search_runtime_e2e.js` | ❌ pas `agentProcessEventPipeline` |
| E2E — pipeline `checkNaturalSearchControl()` | ⚠️ partiel | `test_natural_search_e2e_pipeline.js` | ✅ appelle `checkNaturalSearchControl()` avec DB SQLite, mais pas le pipeline complet `processEventQueueImpl()` |
|| SearchGenome | ⚠️ module isolé | `searchGenomeService.js` | ❌ non consommé par l'Actuator |
|| Cognitive Affinity | ⚠️ module isolé | `cognitiveAffinityService.js` | ❌ non branché |
|| Generalized Foraging | ⚠️ module isolé | `searchPatchService.js` | ❌ non appelé par `forage()` de l'Actuator |
|| Causal Replay Service | ⚠️ module isolé | `causalReplayService.js` | ❌ non consommé par l'Actuator |
|| Negative Search Memory | ⚠️ module isolé | `negativeSearchMemoryService.js` | ❌ non branché |
|| Search Evolution | ⚠️ module isolé | `searchEvolutionService.js` | ❌ non consommé par l'Actuator |
|| Cultural Transmission | ⚠️ module isolé | `searchCultureService.js` | ❌ non branché |

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
  │    ├─ PLASTICITE       → UPDATE agents.topology/tools (DB)
  │    ├─ CLONAL_AFFINITY_SEARCH → variants + lineageController.cloneFromAgent (DB)
  │    ├─ STRESS_HYPERMUTATION   → mutateGenome (mémoire, pas searchGenomeService)
  │    ├─ SPECIATION             → lineageController.cloneFromAgent + INSERT niches (DB)
  │    ├─ EVOLUTION              → crossoverGenome + mutateGenome (mémoire)
  │    ├─ REPLAY_CAUSAL          → SELECT snapshot + applySnapshotState (DB)
  │    └─ CONTINUE               → no-op
  └─ SearchPersistence.saveHypothesis/saveDecision/savePressureState()
```

## Points d'audit résolus

|| Point | Description | Statut |
|| --- | --- | --- |
|| 1 | Hystérésis : mapping PHASE_EXIT + logique hold | ✅ corrigé |
|| 2 | Actuator : enum EVOLUTION + méthodes *Sync | ✅ corrigé |
|| 3 | Hypothèses à partir d'événements runtime (`maybeProposeHypothesis`) | ✅ implémenté |
|| 4 | Preuve → hypothèse par `hypothesisId` (rejet preuve sans ID + falsifiée) | ✅ implémenté |
|| 5 | `executeProcess({selection, searchCtx, actuator})` + `searchCtx` transmis | ✅ corrigé |
|| 6 | Source unique `searchProcessTypes.js` | ✅ implémenté |
|| 7 | Actuator → primitives GenOS réelles (partiel — voir limitations) | ✅ partiel |
|| 8 | Persistence SQLite opérationnelle (API async `sqlite`) | ✅ implémenté |
|| 9 | E2E `checkNaturalSearchControl()` avec vraie DB SQLite | ✅ implémenté |
|| 10 | Docs/code synchronisées | ✅ cette revision |

### Correctifs P0/P1 livrés le 2026-09-22

- **`ledger.PROVENANCE → undefined`** : `naturalSearchRuntime.js` importait `HypothesisLedger, HYPOTHESIS_STATUS` depuis `hypothesisLedgerService` mais utilisait `ledger.PROVENANCE.SELF_REPORTED`. Le module exporte `PROVENANCE` nommé, pas sur l'instance. Correction : import explicite `{ HypothesisLedger, HYPOTHESIS_STATUS, PROVENANCE }` et usage de `PROVENANCE.SELF_REPORTED`. Le runtime ignore désormais `payload.evidenceProvenance` et force `SELF_REPORTED`.
- **Hystérésis inversée (escalade bloquée)** : l'ancienne logique faisait `holdProcess = true` quand `p >= PHASE_ENTER[lastProcess]`, ce qui bloquait toute montée. Correction : `PROCESS_LEVEL` explicite + hystérésis uniquement sur `desiredLevel < currentLevel`.
- **`stepsSinceChange` ne reset pas** : incrémenté dans tous les cas sans reset au changement de processus. Correction : reset à 0 quand `process !== this.lastProcess`, incrément sinon. `stepsInCurrentProcess` géré de même.
- **Actuator `EVOLUTION` manquant** : l'Actuator n'exportait pas `EVOLUTION` dans son `SEARCH_PROCESS` local (contrairement au Controller qui l'importe depuis `searchProcessTypes.js`). L'Actuator utilise désormais les strings bruts du pipeline (`'FORAGE'`, `'PLASTICITE'`, …) en plus du `SEARCH_PROCESS` importé.
- **`executeProcess` sans agentId** : `searchCtx.agentId || selection.agentId` permettait un `agentId` indéfini. Correction : `searchCtx.agentId` requis, sinon log + retour null.
- **Typo `result.result`** dans le `catch` EVOLUTION de l'Actuator.

## Limitations connues

- **Actuator partiel** : seuls PLASTICITE, CLONAL_AFFINITY_SEARCH, SPECIATION et REPLAY_CAUSAL touchent de vraies primitives GenOS (DB agents, lineage, snapshots). FORAGE, STRESS_HYPERMUTATION et EVOLUTION restent principalement déclaratifs (objets construits en mémoire, quelques appels DB optionnels).
- **Actuator ne consomme pas les services isolés** : `searchGenomeService.js`, `searchPatchService.js`, `causalReplayService.js`, `searchEvolutionService.js` existent mais ne sont pas appelés par `NaturalSearchActuator`. L'Actuator muté/évolue son propre état interne.
- **Persistence SQLite** : `SearchPersistence` existe avec `saveHypothesis`/`saveProof`/`saveDecision`/`savePressureState`, et `naturalSearchRuntime.js` les appelle dans `persistSearchState()`. Mais `clearSearchState(agentId)` à la fin de `handleChildClose` dans `agentProcessEventPipeline.js` détruit l'état mémoire sans garantir le flush. La persistance est donc utilisée, mais non critique — les appels sont en `try/catch` silencieux et ne bloquent pas le pipeline.
- **Provenance uniforme** : le runtime force `SELF_REPORTED` pour toute preuve injectée via `ingestEvidence`. Il n'existe pas encore de routage `LLM→SELF_REPORTED / runtime→INFERRED / tool→OBSERVED / verifier→VERIFIED`. Le producteur d'une claim ne peut pas auto-attribuer sa provenance, mais le runtime ne la détermine pas non plus contextuellement.

## Principe fondamental

> **Nature is not a database of solutions. Nature is a collection of search processes.**

$$

\boxed{
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
}

$$

## Références biologiques

1. Spiro, Parkinson & Othmer 1997 — chemotaxie bactérienne
2. Schwab, Casasa & Moczek 2019 — plasticité développementale
3. Foster 2007 — mutagenèse de stress
4. Bowers, Boyle & Damoiseaux 2018 — maturation d'affinité
