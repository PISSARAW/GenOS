# ADR 0155 — Hypothèse promue, plan et action

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Planification, hypothèses, rollback
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/hypothesisActionPlannerService.js` (`promoteHypothesis`, `buildPlan`, `executePlan`)
  - Tests : `../../backend/tests/test_hypothesis_action_planner.js`

## Contexte

Une hypothèse pouvait devenir plan sans preuve référencée, et l'exécution ne comparait pas la différence sémantique attendue à l'observation, rendant le rollback discrétionnaire.

## Décision

Une hypothèse ne devient plan qu'avec des preuves référencées (`evidenceRefs` non vides). Le plan porte la différence sémantique attendue (`semanticDelta`) et un état avant (`stateBeforeHash`, rollback activé). L'observation compare cette différence ; toute divergence rend le rollback obligatoire (`rollback: true`, mésappariements exposés).

## Conséquences

- Positives : promotion conditionnée aux preuves, rollback obligatoire et auditable sur divergence.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; comparaison JSON stricte, sensible aux formats.
- Neutres : le plan exige une hypothèse au statut `promoted` et une action typée, sinon blocage (`PLAN_BLOCKED`).

## Alternatives

- **Plan sans preuve** : rejetée — autorisait l'action sur hypothèse nue.
- **Rollback facultatif** : rejetée — divergence observée sans repli imposé.
