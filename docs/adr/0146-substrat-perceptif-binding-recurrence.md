# ADR 0146 — Substrat perceptif, binding et récurrence

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Perception, suivi d'objets, binding
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/perceptiveBindingService.js` (`bindPercepts`, `recurrentUpdate`, `bindingPermutation`)
  - Tests : `../../backend/tests/test_perceptive_binding.js`

## Contexte

Le substrat perceptif perdait l'identité des objets entre observations : une occlusion partielle effaçait l'objet au lieu d'atténuer sa confiance, et aucun contrôle ne vérifiait que le binding tenait sous permutation des identifiants.

## Décision

Le substrat conserve des objets identifiés, leurs traits et relations. Une observation partiellement occultée réutilise l'état précédent avec confiance atténuée (× 0,8, occulté → 0,5) ; une permutation des IDs fournit le contrôle de binding (`bindingPermutation`). La mise à jour récurrente expose explicitement la continuité (`recurrence`) et les occlusions résolues (`resolvedOcclusions`, confiance > 0,5).

## Conséquences

- Positives : persistance d'identité mesurable, contrôle de binding explicite, continuité et résolutions exposées au lieu d'être implicites.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; les facteurs 0,8 / 0,5 sont des conventions, pas des paramètres appris.
- Neutres : les objets disparus du champ restent portés par l'état précédent jusqu'à preuve contraire.

## Alternatives

- **Réinitialisation à chaque observation** : rejetée — détruisait la continuité du suivi.
- **Confiance binaire présent/absent** : rejetée — interdisait la gradation sous occlusion.
