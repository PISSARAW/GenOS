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

Le problème n'est pas l'absence de métaphores biologiques mais l'absence de **capacité à choisir quel processus de recherche activer** face à une situation donnée.

## Décision

Implémenter un **Natural Search Control Plane** en plusieurs phases au-dessus des mécanismes existants.

## État d'implémentation

Revue du 2026-10-06. La décision initiale reste datée du 2026-09-21 ;
[ADR 0323](0323-reprise-atomique-natural-search.md) précise désormais l'atomicité,
la provenance et le contrat durable. La [fiche runtime](../01-concepts/natural-search-control-plane.md)
décrit l'exécution et ses limites actuelles.

### Phases intégrées (core pipeline)

| Phase | Composant | Statut | Fichier |
| --- | --- | --- | --- |
| 1 | Causal Progress Sensor | ✅ intégré | `backend/src/services/search/causalProgressService.js` |
| 2 | Entropy × Progression Classifier | ✅ intégré | `backend/src/services/search/entropyProgressClassifier.js` |
| 3 | Hypothesis Ledger | ✅ intégré | `backend/src/services/search/hypothesisLedgerService.js` |
| 4 | Search Pressure Model | ✅ intégré | `backend/src/services/search/searchPressureService.js` |
| 5 | Natural Search Controller | ✅ intégré | `backend/src/services/search/naturalSearchController.js` |
| 5.5 | Natural Search Actuator | ✅ intégré | `backend/src/services/search/naturalSearchActuatorService.js` + `backend/src/services/search/naturalSearchActuatorPrimitives.js` |
| 5.5 | SearchPersistence (SQLite) | ✅ intégré | `backend/src/services/search/searchPersistenceService.js` |
| 5.5 | Runtime Integration via `checkNaturalSearchControl()` | ✅ intégré | `backend/src/services/agentProcessEventPipeline.js` |
| 6–12 | Génome, variants, patches, replay, mémoire négative, population et culture | ✅ runtime et reprise atomique après crash | `backend/src/services/search/actuatorModules.js`, `searchRuntimeCheckpoint.js`, `searchStateCodec.js` |

### Processus exécutés par l'actuateur

`ActuatorModules` partage les états avec le runtime. Les primitives de plasticité
et de spéciation restent dans `naturalSearchActuatorPrimitives.js`.

| Processus | Exécution actuelle |
| --- | --- |
| FORAGE | `SearchPatchService` utilise le gain mesuré ; visites, départs et historique sont durables |
| PLASTICITE | Mutation de la topologie du génome de recherche partagé, conservée dans le checkpoint |
| CLONAL_AFFINITY_SEARCH | Création et classement de variants admissibles, adoption du meilleur génome et proposition au ledger |
| STRESS_HYPERMUTATION | `mutateGenome` selon le rayon sélectionné ; génome et mutations durables |
| SPECIATION | `INSERT` de niches persistantes avec reçu du nombre réellement créé ; aucun nouvel agent lancé |
| EVOLUTION | Une génération de `SearchEvolutionEngine` sur la population existante ; fitness dérivée du ledger |
| REPLAY_CAUSAL | `CausalReplayService` analyse le journal et les checkpoints disponibles ; entrée vide ignorée, `stateRestored: false` |

### Tests

| Couverture | Statut | Fichier |
| --- | --- | --- |
| Composants isolés (LED, Controller, Actuator, Persistence en mémoire) | ✅ | `backend/tests/search/test_natural_search_runtime_e2e.js` |
| `checkNaturalSearchControl()` avec DB SQLite | ✅ | `backend/tests/search/test_natural_search_e2e_pipeline.js` |
| Full pipeline (checkNaturalSearchControl + persistence + negative memory + proactive) | ✅ | `backend/tests/search/test_natural_search_full_pipeline_e2e.js` |
| Round-trip des sept états de module après fermeture/réouverture SQLite | ✅ | `backend/tests/search/test_natural_search_module_restore.js` |
| Checkpoint complet, prochaine décision, événements concurrents et flush refusé | ✅ | `backend/tests/search/test_natural_search_durability.js` |
| Arrêt brutal après projections partielles et conflit de révision | ✅ | `backend/tests/search/test_natural_search_crash.js` |
| Provenance, corruption, propriétaires et transmission culturelle durable | ✅ | `backend/tests/search/test_natural_search_integrity.js` |
| Routage, rayon réel, sorties des processus, TTL et plasticité sur schéma de production | ✅ | `backend/tests/search/test_natural_search_routing.js` |

Commande : `npm --prefix backend run test:natural-search` — 21 scripts passés
le 2026-10-06 sur `f101f24f`. Cette suite vérifie le contrat interne ; elle ne
mesure pas une efficacité causale générale en production.

### Contrats transversaux

| Fonctionnalité | Implémentation |
| --- | --- |
| Provenance | Source runtime uniquement ; payload ignoré ; résultats d'outils `OBSERVED`, claims dont `EVIDENCE_REPORT` `SELF_REPORTED` ; aucune vérification automatique par le nom de l'événement |
| Protocole hypothèses | `HYPOTHESIS_PROPOSED`, `HYPOTHESIS_TEST_STARTED`, `HYPOTHESIS_PROGRESS`, `HYPOTHESIS_FALSIFIED`, `HYPOTHESIS_SUSPENDED` ; propriétaire et identité préservés |
| Reprise atomique | `search_runtime_checkpoint`, document version 1 et révision comparée ; projections historiques et import des anciens états en absence de checkpoint |
| Flush attendu | `clearSearchState()` attend l'écriture avant suppression ; en cas d'échec, mémoire conservée et erreur propagée |
| Proposition proactive | Après plus de cinq étapes sans progrès et sans hypothèse active, sous réserve de la mémoire négative |
| Culture sous preuve | Validation explicite du génome par l'appelant runtime, reproductibilité, taux fini dans [0,7 ; 1], deux références observées ou vérifiées distinctes sur des hypothèses soutenues de la famille |
| Livraison culturelle | Outbox du checkpoint engagé, même organisation et projet, réception durable et idempotente ; le trait reçu reste un candidat |

### Limitations connues

- Le replay analyse un journal borné à 100 événements et ses checkpoints ; il
  ne reconstitue pas tout l'historique ni un workspace externe.
- La plasticité agit sur le génome de recherche, sans modifier les leases
  d'outils ou les appartenances aux topologies d'orchestration.
- La spéciation persiste des niches, sans clonage ou lancement d'agents.
- La mémoire négative bloque par agent, énoncé exact et TTL ; les conditions
  conservées ne constituent pas un moteur de correspondance conditionnelle.
- Un succès d'évolution ou de sélection clonale ne produit pas à lui seul une
  validation culturelle. La validation demeure une entrée de l'appelant.
- Un format invalide ou futur, une identité étrangère et une écriture échouée
  refusent la reprise. Un conflit de révision exige une recharge explicite ;
  les projections seules ne garantissent pas l'atomicité.

## Références

- Spiro, Parkinson & Othmer 1997 — chemotaxie bactérienne
- Schwab, Casasa & Moczek 2019 — plasticité développementale
- Foster 2007 — mutagenèse de stress
- Bowers, Boyle & Damoiseaux 2018 — maturation d'affinité
