# Natural Search Control Plane

- **Statut** : Partiel — Phases 1–5 opérationnelles, persistance et intégration runtime en place. Actuator fonctionnel. Phases 6–12 non implémentées.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/adr/0032-natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-21.

## État d'implémentation

| Composant | Statut | Fichier |
| --- | --- | --- |
| Causal Progress Sensor | ✅ Opérationnel | `causalProgressService.js` |
| Entropy×Progression Classifier | ✅ Opérationnel | `entropyProgressClassifier.js` |
| Hypothesis Ledger | ✅ Opérationnel | `hypothesisLedgerService.js` |
| Search Pressure Model | ✅ Opérationnel | `searchPressureService.js` |
| Natural Search Controller | ✅ Opérationnel | `naturalSearchController.js` |
| Natural Search Actuator | ✅ Opérationnel | `naturalSearchActuatorService.js` |
| SearchReceipt | ✅ Opérationnel | `SearchReceipt.js` |
| Runtime Integration | ✅ Branché | `agentProcessEventPipeline.js` |
| Persistance SQLite | ✅ Opérationnel | `searchPersistenceService.js` |
| E2E Runtime Test | ✅ Passing | `test_natural_search_runtime_e2e.js` |

## Fonctionnement

Pour chaque événement du runtime :
1. Alimentation du CausalProgress avec les preuves
2. Détection des preuves d'erreur/aucun progrès
3. Calcul de la pression avec inertie
4. Sélection du processus par le contrôleur
5. Exécution via l'Actuator (si non-CONTINUE)
6. Émission d'événements traçables

## Phases reportées

- Phase 6 : Hypermutation structurée du SearchGenome
- Phase 7 : Affinité cognitive
- Phase 8 : Foraging généralisé
- Phase 9 : Replay causal automatique
- Phase 10 : Mémoire négative
- Phase 11 : Évolution des processus
- Phase 12 : Transmission/plasmides
