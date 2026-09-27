# ADR 0158 — Banc morphogenèse et opérateurs comparés

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Morphogenèse, banc d'opérateurs, évaluation
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/morphogenesisBenchmarkService.js` (`compareOperators`, `validateComparison`)
  - Tests : `../../backend/tests/test_morphogenesis_operator_benchmark.js`

## Contexte

Les opérateurs morphogénétiques pouvaient être comparés à budgets inégaux, sans variable modératrice enregistrée, et un gain pouvait être déclaré après touche du corpus réservé.

## Décision

Les opérateurs sont comparés à budget égal (hors budget exclus, `withinBudget`), avec une variable modératrice explicitement enregistrée (`moderator`, éventuellement `null`). Le banc exclut tout opérateur hors budget et contrôle que le corpus réservé reste intact (`reservedUntouched`, `reservedTouched !== true`) avant de déclarer un gain (score du gagnant moins baseline, `null` sans gagnant éligible).

## Conséquences

- Positives : comparaison équitable à budget égal, modératrice tracée, gain invalidé si corpus touché (`reserved_touched`).
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; score brut sans incertitude ni réplications.
- Neutres : sans opérateur éligible, aucun gagnant ni gain — comparatif invalide, pas d'échec silencieux.

## Alternatives

- **Comparaison sans contrainte de budget** : rejetée — avantage aux opérateurs coûteux.
- **Gain déclaré sur corpus touché** : rejetée — fuite entre évaluation et réserve.
