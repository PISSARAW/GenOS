# Natural Search Control Plane

- **Statut** : Phases 1–8 implémentées et testées (Points 1–8). Phases 9–12 : modules isolés non intégrés.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/adr/0032-natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-22.

## État d'implémentation

| Composant | Statut | Fichier | Intégration pipeline |
| --- | --- | --- | --- |
| Causal Progress Sensor | ✅ | `causalProgressService.js` | ✅ via `checkNaturalSearchControl()` |
| Entropy×Progression Classifier | ✅ | `entropyProgressClassifier.js` | ✅ |
| Hypothesis Ledger | ✅ | `hypothesisLedgerService.js` | ✅ |
| Search Pressure Model | ✅ | `searchPressureService.js` | ✅ |
| Natural Search Controller | ✅ | `naturalSearchController.js` | ✅ |
| Natural Search Actuator | ✅ | `naturalSearchActuatorService.js` | ✅ primitives GenOS réelles |
| SearchReceipt | ✅ | `SearchReceipt.js` | ✅ |
| Runtime Integration | ✅ | `agentProcessEventPipeline.js` | ✅ via `checkNaturalSearchControl()` |
| Persistance SQLite | ✅ | `searchPersistenceService.js` | ✅ saveHypothesis/saveProof/savePressure/saveDecision |
| E2E Pipeline Test | ✅ | `test_natural_search_e2e_pipeline.js` | ✅ entrée via `checkNaturalSearchControl()` |
| SearchGenome | ✅ | `searchGenomeService.js` | ✅ via `naturalSearchActuatorPrimitives.js` |
| Cognitive Affinity | ⚠️ module isolé | `cognitiveAffinityService.js` | ❌ non branché |
| Generalized Foraging | ✅ | `searchPatchService.js` | ✅ via `forage()` primitive |
| Causal Replay Service | ✅ | `causalReplayService.js` | ✅ via `replayCausal()` primitive |
| Negative Search Memory | ⚠️ module isolé | `negativeSearchMemoryService.js` | ❌ non branché |
| Search Evolution | ✅ | `searchEvolutionService.js` | ✅ via `evolution()` primitive |
| Cultural Transmission | ⚠️ module isolé | `searchCultureService.js` | ❌ non branché |

## Architecture finale

```
Event (AGENT_STEP / EVIDENCE_REPORT / AGENT_FAILED)
  ↓
agentProcessEventPipeline.processEventQueueImpl()
  ↓
checkNaturalSearchControl(ctx, event)
  ├─ CausalProgressService.ingestEvent()
  ├─ HypothesisLedger.addEvidence() / propose()
  ├─ NaturalSearchController.selectProcess()
  ├─ NaturalSearchActuator.execute()
  │    ├─ FORAGE → SearchPatchService (gestion patches)
  │    ├─ PLASTICITE → applySnapshotState (DB agents.topology/tools)
  │    ├─ CLONAL_AFFINITY_SEARCH → SearchGenomeService variants
  │    ├─ STRESS_HYPERMUTATION → mutateGenome (DB agents.search_genome)
  │    ├─ SPECIATION → SearchPatchService (DB search_niches)
  │    ├─ EVOLUTION → crossoverGenome + mutateGenome (DB agents.search_genome)
  │    └─ REPLAY_CAUSAL → agent_state_snapshots (DB)
  └─ SearchPersistence.saveHypothesis/saveDecision/savePressureState()
```

## Points d'audit résolus

| Point | Description | Statut |
| --- | --- | --- |
| 1 | Hystérésis : mapping PHASE_EXIT + logique hold | ✅ corrigé |
| 2 | Actuator : enum EVOLUTION + méthodes *Sync | ✅ corrigé |
| 3 | Hypothèses à partir d'événements runtime | ✅ implémenté |
| 4 | Preuve → hypothèse par hypothesisId | ✅ implémenté |
| 5 | executeProcess({selection, searchCtx, actuator}) | ✅ corrigé |
| 6 | Source unique enum searchProcessTypes.js | ✅ implémenté |
| 7 | Actuator → primitives GenOS réelles | ✅ implémenté |
| 8 | Persistence SQLite opérationnelle | ✅ implémenté |
| 9 | E2E passant par checkNaturalSearchControl() | ✅ implémenté |
| 10 | Docs/code synchronisées | ✅ implémenté |

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
