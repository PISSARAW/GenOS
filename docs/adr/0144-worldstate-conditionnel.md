# ADR 0144 — WorldState conditionnel

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Représentation d'état, incertitude, décision conditionnelle
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/worldStateConditionalService.js` (`recordState`, `compareStates`, `conditionalChoice`)
  - Tests : `../../backend/tests/test_world_state_conditional.js`

## Contexte

Le runtime compare des états avant/après sans statut de support explicite : un état hors distribution (OOD) pouvait alimenter une décision comme s'il était prêt, et les choix concurrents n'étaient pas départagés par une utilité corrigée de l'incertitude.

## Décision

Le WorldState porte l'état avant/après, ses références de preuve et un statut de support (`supported` si références, `uncertain` sinon). La comparaison expose delta, incertitude et OOD ; un état OOD ne peut pas produire une décision prête (`decisionReady` exige incertitude ≤ 0,5 et non-OOD). Les choix concurrents sont classés par utilité attendue corrigée de l'incertitude, avec au moins deux candidats requis.

## Conséquences

- Positives : refus explicite de décider sur OOD ; traçabilité avant/après avec support de preuve ; sélection déterministe et testable.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; le seuil 0,5 et la soustraction utilité − incertitude sont des conventions non prouvées optimales.
- Neutres : `recordState` n'invente pas de références (liste vide → `uncertain`).

## Alternatives

- **Décision sur état brut sans statut** : rejetée — autorisait des promotions sur support inconnu.
- **Seuil probabiliste calibré** : reportée — exige des données d'étalonnage ; le seuil fixe reste une garde, pas une probabilité.
