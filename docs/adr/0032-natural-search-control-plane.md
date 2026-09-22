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
| 5.5 | Runtime Integration | ✅ intégré | `agentProcessEventPipeline.js` via `checkNaturalSearchControl()` |
| 6-7 | SearchGenome + ActuatorPrimitives | ✅ intégré | `naturalSearchActuatorPrimitives.js` |
| 7 | Actuator → primitives GenOS | ✅ intégré | `searchGenomeService.js`, `searchPatchService.js`, `causalReplayService.js` |
| 8 | Persistence SQLite opérationnelle | ✅ intégré | `searchPersistenceService.js` API Promise |
| 9 | E2E pipeline test | ✅ intégré | `test_natural_search_e2e_pipeline.js` |
| 10 | Docs synchronisées | ✅ intégré | `natural-search-control-plane.md`, `adr/0032` |

### Modules isolés (non intégrés au pipeline)

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
6. ✅ Ajouter un `NaturalSearchActuator` reliant décisions aux primitives GenOS
7. ✅ Persister le Ledger et la pression en SQLite
8. ✅ Écrire un test E2E complet
9. ✅ Intégrer SearchGenome, SearchPatch, CausalReplay, SearchEvolution via `naturalSearchActuatorPrimitives.js`
10. ✅ Synchroniser docs/code (ADR 0032 + concept)

## Références

- Spiro, Parkinson & Othmer 1997 — chemotaxie bactérienne
- Schwab, Casasa & Moczek 2019 — plasticité développementale
- Foster 2007 — mutagenèse de stress
- Bowers, Boyle & Damoiseaux 2018 — maturation d'affinité
