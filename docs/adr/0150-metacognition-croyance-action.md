# ADR 0150 — Métacognition, croyance et action

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Métacognition, calibration, abstention
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/metacognitiveBeliefActionService.js` (`monitor`, `reviseBelief`, `chooseAction`)
  - Tests : `../../backend/tests/test_metacognitive_belief_action.js`

## Contexte

Les actions pouvaient être choisies sans comparer la confiance attendue à l'exactitude observée, et la croyance n'était pas révisée par l'erreur mesurée.

## Décision

Le monitoring compare confiance attendue et exactitude observée (erreur absolue ; `reliable` si ≤ 0,2, `abstain` si > 0,5). L'erreur révise la croyance avec un taux borné (0,05–0,5, défaut 0,2) ; une erreur élevée impose l'abstention avant l'action. Les actions sont choisies seulement après ce contrôle, par utilité maximale.

## Conséquences

- Positives : abstention calibrée sur erreur mesurée, révision de croyance bornée et traçable (`revised`).
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; seuils 0,2 / 0,5 conventionnels, non étalonnés.
- Neutres : sans action candidate, le choix retombe sur `abstain`.

## Alternatives

- **Action sans contrôle métacognitif** : rejetée — aucune garde contre la surconfiance.
- **Révision non bornée** : rejetée — une observation aberrante effacerait la croyance.
