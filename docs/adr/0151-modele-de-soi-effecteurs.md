# ADR 0151 — Modèle de soi et effecteurs

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Modèle de soi, copie d'efférence, attribution
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/selfEffectorModelService.js` (`registerEffectors`, `predictEffect`, `attributeObservation`)
  - Apparenté : `../../backend/src/services/selfModelService.js`
  - Tests : `../../backend/tests/test_self_effector_model.js`, `../../backend/tests/test_self_model_service.js`

## Contexte

Sans copie prédictive de l'effet de ses propres actionneurs, le système ne pouvait attribuer un écart d'observation au soi ou au monde, et une perturbation de gain ou de délai restait indiscernable d'une auto-déclaration.

## Décision

Les effecteurs sont enregistrés avec gain et délai. Une copie prédictive de l'effet (`valeur × gain`, délai attendu, `selfGenerated`) est comparée à l'observation pour attribuer l'écart au soi ou au monde, avec délai observé. Un effecteur inconnu bloque (`UNKNOWN_EFFECTOR`). Une perturbation de gain ou de délai est donc mesurable et ne se réduit pas à une auto-déclaration.

## Conséquences

- Positives : attribution soi/monde mesurable, perturbations de gain et délai détectables, effecteurs inconnus refusés.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; modèle linéaire (gain × valeur), sans dynamique ni bruit.
- Neutres : l'attribution `self` repose sur le marquage de la prédiction, pas sur une introspection.

## Alternatives

- **Auto-déclaration sans prédiction** : rejetée — non vérifiable.
- **Attribution sans délai enregistré** : rejetée — confond latence d'effecteur et résistance du monde.
