# ADR 0157 — Apprentissage inter-missions et consolidation

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Mémoire inter-missions, lignées, consolidation
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/interMissionConsolidationService.js` (`recordLesson`, `consolidate`, `revalidate`)
  - Tests : `../../backend/tests/test_intermissions_consolidation.js`

## Contexte

Des leçons retenues sans lignée ni preuve pouvaient être réutilisées après redémarrage, et les leçons actives se mélangeaient aux fossiles sans revalidation des références.

## Décision

Une leçon retenue porte sa lignée (`lineageId`) et ses preuves (`evidenceRefs` non vides, sinon `LESSON_UNVERIFIED`). La consolidation conserve les leçons actives par niche (défaut 100 dernières, niche conservée), garde les fossiles séparés, et revalide les références après redémarrage avant réutilisation (`revalidate` : toute référence manquante invalide, réutilisable seulement si valide et lignée présente).

## Conséquences

- Positives : leçons tracées par lignée et preuves, fossiles isolés, réutilisation conditionnée à la revalidation.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; fenêtre de rétention (100) et tri par niche conventionnels.
- Neutres : le nom du test (`test_intermissions_consolidation.js`) comporte une coquille historique, conservée sans renommage.

## Alternatives

- **Leçon sans lignée ni preuve** : rejetée — réutilisation non traçable.
- **Consolidation sans revalidation** : rejetée — références mortes réutilisées après redémarrage.
