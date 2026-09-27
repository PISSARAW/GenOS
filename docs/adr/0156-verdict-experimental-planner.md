# ADR 0156 — Verdict expérimental et planner

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Expérimentation, verdicts, pilotage PID
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/experimentalVerdictPlannerService.js` (`admissibleVerdict`, `transition`, `pidRecommendation`)
  - Tests : `../../backend/tests/test_experimental_verdict_planner.js`

## Contexte

Un verdict pouvait recommander une transition du planner sans reçu causal ni contexte de protocole, et la recommandation de pilotage n'exposait pas ses termes d'erreur.

## Décision

Un verdict ne peut recommander une transition du planner que s'il porte un reçu causal (`CausalInterventionReceipt` avec verdict) et le contexte du protocole/manifeste (`protocolId`, `manifestHash`) ; sinon la transition est `blocked`. La recommandation PID expose erreur, intégrale et dérivée (gains `kp`/`ki`/`kd`, défauts 1/0/0).

## Conséquences

- Positives : transition conditionnée au reçu et au contexte (`context_bound`), pilotage PID inspectable.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; PID positionnel simple, sans anti-windup ni saturation.
- Neutres : un verdict non `supported` mais admissible donne `inconclusive`, jamais `recommended`.

## Alternatives

- **Transition sur verdict nu** : rejetée — sans reçu ni contexte, non auditable.
- **Correcteur boîte noire** : rejetée — termes PID masqués, non réglables.
