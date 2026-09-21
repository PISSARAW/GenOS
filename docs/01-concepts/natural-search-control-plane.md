# Natural Search Control Plane

- **Statut** : Phases 1–12 implémentées, tests passants, intégration runtime active, persistance SQLite opérationnelle.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/adr/0032-natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-21.

## État d'implémentation

| Composant | Statut | Fichier |
| --- | --- | --- |
| Causal Progress Sensor | ✅ | `causalProgressService.js` |
| Entropy×Progression Classifier | ✅ | `entropyProgressClassifier.js` |
| Hypothesis Ledger | ✅ | `hypothesisLedgerService.js` |
| Search Pressure Model | ✅ | `searchPressureService.js` |
| Natural Search Controller | ✅ | `naturalSearchController.js` |
| Natural Search Actuator | ✅ | `naturalSearchActuatorService.js` |
| SearchReceipt | ✅ | `SearchReceipt.js` |
| Runtime Integration | ✅ | `agentProcessEventPipeline.js` |
| Persistance SQLite | ✅ | `searchPersistenceService.js` |
| **SearchGenome (Phase 6)** | ✅ | `searchGenomeService.js` |
| **Cognitive Affinity Maturation (Phase 7)** | ✅ | `cognitiveAffinityService.js` |
| **Generalized Foraging (Phase 8)** | ✅ | `searchPatchService.js` |
| **Causal Replay (Phase 9)** | ✅ | `causalReplayService.js` |
| **Negative Search Memory (Phase 10)** | ✅ | `negativeSearchMemoryService.js` |
| **Evolution of Search Processes (Phase 11)** | ✅ | `searchEvolutionService.js` |
| **Cultural Transmission / Plasmides (Phase 12)** | ✅ | `searchCultureService.js` |

## Architecture finale

```
Event
  ↓
Swarm Sentinel
  ↓
Natural Search Control Plane
  ├─ Causal Progress Sensor
  ├─ Entropy×Progress Classifier
  ├─ Hypothesis Ledger
  ├─ Search Pressure Model
  ├─ Natural Search Controller
  ├─ Natural Search Actuator
  ├─ SearchPersistence (SQLite)
  └─ Phases 6–12:
      ├─ SearchGenome + hypermutation
      ├─ Cognitive Affinity Maturation
      ├─ Generalized Foraging (SearchPatch)
      ├─ Causal Replay
      ├─ Negative Memory
      ├─ Search Evolution
      └─ Cultural Transmission (Plasmides)
  ↓
GenOS primitives (replay, fork, foraging, recovery)
```

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
