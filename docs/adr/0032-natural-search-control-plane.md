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
|| 1 | Causal Progress Sensor | ✅ intégré | `causalProgressService.js` |
|| 2 | Entropy × Progression Classifier | ✅ intégré | `entropyProgressClassifier.js` |
|| 3 | Hypothesis Ledger | ✅ intégré | `hypothesisLedgerService.js` |
|| 4 | Search Pressure Model | ✅ intégré | `searchPressureService.js` |
|| 5 | Natural Search Controller | ✅ intégré | `naturalSearchController.js` |
|| 5.5 | Natural Search Actuator | ✅ intégré | `naturalSearchActuatorService.js` + `naturalSearchActuatorPrimitives.js` |
|| 5.5 | SearchPersistence (SQLite) | ✅ intégré | `searchPersistenceService.js` |
|| 5.5 | Runtime Integration via `checkNaturalSearchControl()` | ✅ intégré | `agentProcessEventPipeline.js` |
|| 6 | SearchIntegration (CognitiveAffinity + NegativeSearchMemory + SearchCulture) | ✅ intégré | `searchIntegrationService.js` |

### Primitives consommées via `naturalSearchActuatorPrimitives.js`

|| Processus | Primitive utilisée |
|| --- | --- |
|| FORAGE | `SearchPatchService` (évaluation départ/continuation) |
|| PLASTICITE | `UPDATE agents.topology/tools` (DB) |
|| CLONAL_AFFINITY_SEARCH | `mutateGenome` + `createRandomGenome` (SearchGenome) |
|| STRESS_HYPERMUTATION | `mutateGenome` (SearchGenome) + `SearchPersistence.saveGenomeSnapshot` |
|| SPECIATION | `cloneFromAgent` (lineage) + `INSERT` niches (DB) |
|| EVOLUTION | `crossoverGenome` + `mutateGenome` (SearchGenome) + `SearchEvolutionEngine` |
|| REPLAY_CAUSAL | `SELECT snapshot` + `applySnapshotState` (DB) + `CausalReplayService` |

### Tests

|| Couverture | Statut | Fichier |
|| --- | --- | --- |
|| Composants isolés (LED, Controller, Actuator, Persistence en mémoire) | ✅ | `test_natural_search_runtime_e2e.js` |
|| `checkNaturalSearchControl()` avec DB SQLite | ✅ | `test_natural_search_e2e_pipeline.js` |
|| Full pipeline (checkNaturalSearchControl + persistence + negative memory + proactive) | ✅ | `test_natural_search_full_pipeline_e2e.js` |

### Fonctionnalités cross-cutting

|| Fonctionnalité | Implémentation |
|| --- | --- |
|| Routage de provenance | `resolveProvenance()` — LLM→SELF_REPORTED / event→INFERRED / tool→OBSERVED / evidence→VERIFIED |
|| Flush garanti | `clearSearchState()` → `flushSearchState()` avant suppression mémoire |
|| Création proactive d'hypothèses | `proactiveHypothesis()` après 5 étapes sans progrès |

### Limitations connues

- L'Actuator passe par `naturalSearchActuatorPrimitives.js` qui délègue aux services via singletons, pas par injection directe.
- `STRESS_HYPERMUTATION` et `FORAGE` construisent encore des objets locaux (genome/patch) en plus des appels services.
- `resolveProvenance` respecte `payload.provenance` du LLM s'il est présent (sinon routage automatique).

## Références

- Spiro, Parkinson & Othmer 1997 — chemotaxie bactérienne
- Schwab, Casasa & Moczek 2019 — plasticité développementale
- Foster 2007 — mutagenèse de stress
- Bowers, Boyle & Damoiseaux 2018 — maturation d'affinité
