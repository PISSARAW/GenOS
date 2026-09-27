# ADR 0152 — Objectifs concurrents et allostase

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Objectifs multiples, arbitrage, charge allostatique
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/allostaticObjectiveService.js` (`normalizeObjectives`, `evaluate`, `comparePolicies`, `updateAllostasis`)
  - Tests : `../../backend/tests/test_allostatic_objectives.js`

## Contexte

Des objectifs concurrents sans poids, valeur et invariants minimaux explicites permettaient qu'une politique à haute utilité masque la violation d'un invariant vital.

## Décision

Les objectifs portent poids, valeur et invariants minimaux. Les politiques sont comparées sur une utilité pénalisée par la pression allostatique (`Σ poids × valeur − pression`) ; une violation d'invariant reste visible (`violations`, `invariantSatisfied: false`) même si l'utilité est élevée. La pression est mise à jour par l'erreur observée avec un gain borné (0,2, pression ≥ 0).

## Conséquences

- Positives : arbitrage multi-objectifs explicite, violations d'invariants jamais masquées, pression allostatique traçable et bornée.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; utilité linéaire et gain 0,2 conventionnels.
- Neutres : le classement par utilité n'efface pas les violations — elles restent exposées au décideur.

## Alternatives

- **Utilité sans invariants minimaux** : rejetée — autorisait l'écrasement des garde-fous par l'utilité.
- **Pression allostatique non bornée** : rejetée — emballement possible sur erreurs répétées.
