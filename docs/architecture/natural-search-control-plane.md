# Natural Search Control Plane

Le Natural Search Control Plane est la couche qui unifie les mécanismes
biomimétiques de GenOS autour d'une idée centrale :

> **Nature is not a database of solutions. Nature is a collection of search processes.**

## Architecture

```
                       ┌─────────────────────┐
                       │   ENVIRONMENT       │
                       │ problème + preuves  │
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │ SWARM SENTINEL      │
                       │ entropy comportement│
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │ CAUSAL PROGRESS     │ ← Phase 1
                       │ SENSOR              │
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │ HYPOTHESIS LEDGER   │ ← Phase 3
                       │ falsification       │
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │ SEARCH PRESSURE     │ ← Phase 4
                       │ MODEL               │
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │ NATURAL SEARCH      │ ← Phase 5
                       │ CONTROLLER          │
                       └───┬─────────┬───────┘
                           ↓         ↓
                    exploitation  exploration
                           ↓         ↓
                    foraging      plasticity
                           ↓         ↓
                    clonal search  hypermutation
                           ↓         ↓
                    speciation    evolution
```

## Fichiers

| Phase | Service | Tests |
| --- | --- | --- |
| 1 | `search/causalProgressService.js` | `search/test_causal_progress.js` |
| 2 | `search/entropyProgressClassifier.js` | `search/test_entropy_progress_classifier.js` |
| 3 | `search/hypothesisLedgerService.js` | `search/test_hypothesis_ledger.js` |
| 4 | `search/searchPressureService.js` | `search/test_search_pressure.js` |
| 5 | `search/naturalSearchController.js` | `search/test_natural_search_controller.js` |

## Pipeline d'intégration

Le pipeline `agentProcessEventPipeline.js` est le point d'intégration
principal. Les services du Natural Search Control Plane sont conçus pour
être branchés après le Swarm Sentinel, sans le remplacer.

## Invariants

1. **Causal Progress Sensor** : 20 actions différentes sans preuve → stagnation détectée
2. **Entropy × Progression** : 5 états invariants (exploitation/exploration productive, stagnation mécanique, exploration panique, lock-in)
3. **Hypothesis Ledger** : une hypothèse falsifiée ne peut pas recevoir > 80 % du budget
4. **Search Pressure** : pression ∈ [0,1] avec causes et rayon d'escalade
5. **Natural Search Controller** : sélectionne un processus de recherche, pas une solution

## Principe fondamental

```
Observe → Measure progress → Sense pressure → Change search process → Test → Remember
```

> GenOS n'évolue pas pour trouver une réponse.
> GenOS fait évoluer sa manière de chercher.
