# ADR 0145 — Rollout contrôlé et réversible

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Expérimentation, déploiement progressif, rollback
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/controlledRolloutDecisionService.js` (`planControlledRollout`, `observeRollout`, `composeDeltas`)
  - Apparenté : `../../backend/src/services/counterfactualRolloutService.js` (branches avis seulement, ne décide pas)
  - Tests : `../../backend/tests/test_controlled_rollout_decision.js`

## Contexte

Les branches contrefactuelles pouvaient être sélectionnées sur des scores non observés, sans état avant ni token de rollback, et un changement de politique (policy flip) n'était pas marqué comme réversible.

## Décision

Les branches sont classées sur l'observation réelle (`observedScore`). Le delta composé est calculé avant sélection, chaque choix reçoit un état avant et un token de rollback, et une divergence observée déclenche le repli (`rollbackRequired`). Un policy flip reste explicitement réversible (`reversible: true`). Au moins deux branches sont requises.

## Conséquences

- Positives : sélection traçable sur observé, rollback obligatoire en cas de divergence, flip marqué réversible par construction.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; la comparaison numérique stricte des deltas peut signaler des écarts insignifiants.
- Neutres : le service contrefactuel apparenté reste avis seulement et ne décide pas à la place du rollout.

## Alternatives

- **Sélection sur score prédit** : rejetée — confond prédiction et observation.
- **Rollback implicite sans token** : rejetée — non rejouable ni auditable.
