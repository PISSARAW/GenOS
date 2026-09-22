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
6. ⚠️ `NaturalSearchActuator` présent et connecté aux primitives GenOS, partiel (seuls PLASTICITE/CLONAL/SPECIATION/REPLAY_CAUSAL modifient de vrais états)
7. ⚠️ `SearchPersistenceService` implémenté (API async `sqlite`), mais `naturalSearchRuntime.js` efface l'état mémoire à la fin (`clearSearchState`) sans flush garanti
8. ⚠️ Tests E2E sur composants isolés (`test_natural_search_runtime_e2e.js`), pas de test traversant `agentProcessEventPipeline → checkNaturalSearchControl`
9. ❌ Modules isolés non intégrés au pipeline
10. ❌ Runtime ne crée pas d'hypothèses de lui-même (seulement `maybeProposeHypothesis` réactif à `hypothesisId`/gain externe — Ledger demeure vide sans événement porteur)
11. ❌ Provenance uniforme `SELF_REPORTED` forcée par le runtime ; pas de routage `LLM→SELF_REPORTED / runtime→INFERRED / tool→OBSERVED / verifier→VERIFIED`

## Références

- Spiro, Parkinson & Othmer 1997 — chemotaxie bactérienne
- Schwab, Casasa & Moczek 2019 — plasticité développementale
- Foster 2007 — mutagenèse de stress
- Bowers, Boyle & Damoiseaux 2018 — maturation d'affinité
