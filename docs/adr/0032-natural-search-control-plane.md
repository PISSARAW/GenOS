---
title: Natural Search Control Plane
date: 2026-09-21
status: accepted
authors: Bruney
decision-id: 0032
---

# ADR 0032 : Natural Search Control Plane

## Contexte

GenOS accumule des mécanismes biomimétiques homéostatiques, immunitaires, évolutionnaires, de foraging, de plasticité, etc. Ces mécanismes sont encore principalement des îlots.

Le problème n'est pas l'absence de métaphores biologiques mais l'absence de **capacité à choisir quel processus de rechercher activer** face à une situation donnée.

## Décision

Implémenter un **Natural Search Control Plane** en plusieurs phases au-dessus des mécanismes existants.

## État d'implémentation

### Phases intégrées (core pipeline)

| Phase | Composant | Statut | Fichier |
| --- | --- | --- | --- |
| 1 | Causal Progress Sensor | ✅ intégré | `causalProgressService.js` |
| 2 | Entropy × Progression Classifier | ✅ intégré | `entropyProgressClassifier.js` |
| 3 | Hypothesis Ledger | ✅ intégré | `hypothesisLedgerService.js` |
| 4 | Search Pressure Model | ✅ intégré | `searchPressureService.js` |
| 5 | Natural Search Controller | ✅ intégré | `naturalSearchController.js` |
| 5.5 | Natural Search Actuator | ✅ intégré | `naturalSearchActuatorService.js` |
| 5.5 | SearchPersistence (SQLite) | ✅ intégré | `searchPersistenceService.js` |
| 5.5 | Runtime Integration via `checkNaturalSearchControl()` | ✅ intégré | `agentProcessEventPipeline.js` |
| 7 | Actuator → primitives GenOS réelles | ✅ intégré | `naturalSearchActuatorService.js` |
| 8 | Persistance SQLite opérationnelle | ✅ intégré | API Promise `sqlite` |
| 9 | E2E pipeline test | ✅ intégré | `test_natural_search_e2e_pipeline.js` |
| 10 | Docs synchronisées | ✅ intégré | `natural-search-control-plane.md` + ADR 0032 |

### Tests

| Couverture | Statut | Fichier |
| --- | --- | --- |
| Composants isolés (LED, Controller, Actuator, Persistence en mémoire) | ✅ | `test_natural_search_runtime_e2e.js` |
| `checkNaturalSearchControl()` avec DB SQLite | ✅ | `test_natural_search_e2e_pipeline.js` |
| Evolution process | ✅ | `test_search_evolution.js` |

### Modules hors pipeline

| Module | Statut | Fichier |
| --- | --- | --- |
| Cognitive Affinity Maturation | ⚠️ module isolé | `cognitiveAffinityService.js` |
| Negative Search Memory | ⚠️ module isolé | `negativeSearchMemoryService.js` |
| Cultural Transmission / Plasmides | ⚠️ module isolé | `searchCultureService.js` |

## Plan de stabilisation

1. ✅ Corriger le modèle de croyance bayésien
2. ✅ Normaliser le searchYield avec budgets
3. ✅ Séparer medium-stagnation de vrai lock-in via le Ledger
4. ✅ Refaire Search Pressure comme signal d'état avec inertie
5. ✅ Brancher le pipeline dans `agentProcessEventPipeline.js`
6. ✅ `NaturalSearchActuator` : primitives GenOS réelles intégrées (PLASTICITE, CLONAL_AFFINITY_SEARCH, SPECIATION, REPLAY_CAUSAL, EVOLUTION, FORAGE, STRESS_HYPERMUTATION) — voir limitations pour la consommation des services SearchGenome/SearchPatch/CausalReplay
7. ✅ Persistence SQLite : service implémenté, appelé par `persistSearchState()` et `flushSearchState()` dans `naturalSearchRuntime.js`, `clearSearchState()` dans `handleChildClose` flush l'état mémoire avant suppression
8. ✅ Test E2E pipeline : `test_natural_search_full_pipeline_e2e.js` appelle `checkNaturalSearchControl()` avec DB SQLite, persiste hypothèses + décisions + pression + negative memory
9. ✅ Modules isolés intégrés : `SearchPatchService`, `SearchEvolutionEngine`, `CausalReplayService`, `CognitiveAffinity`, `NegativeSearchMemory`, `SearchCulture` branchés via `SearchIntegration`
10. ✅ Actuator → primitives GenOS réelles avec persistance `SearchPersistence`
11. ✅ Runtime → création proactive d'hypothèses (`proactiveHypothesis` après 5 étapes sans progrès)
12. ✅ Routage de provenance : `resolveProvenance()` — LLM→SELF_REPORTED / event→INFERRED / tool→OBSERVED / evidence→VERIFIED

## Références

- Spiro, Parkinson & Othmer 1997 — chemotaxie bactérienne
- Schwab, Casasa & Moczek 2019 — plasticité développementale
- Foster 2007 — mutagenèse de stress
- Bowers, Boyle & Damoiseaux 2018 — maturation d'affinité
