# ADR 0147 — Hiérarchie générative et espace perceptif

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Perception générative, hiérarchie prédictive
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/generativePerceptualService.js` (`predict`, `interpolate`, `inspectSpace`)
  - `../../backend/src/services/predictiveHierarchyService.js` (erreur pondérée ascendante, avis seulement)
  - Tests : `../../backend/tests/test_generative_perceptual.js`

## Contexte

Les embeddings opaques ne permettaient ni d'inspecter prior, observation, précision et estimation, ni de reproduire les interpolations, ni de mesurer la continuité de l'espace perceptif.

## Décision

Le service expose explicitement prior, observation, précision, estimation et erreur ascendante (`observation − prior`). Les vecteurs sont inspectables (`inspectSpace` : dimensions, comptage, continuité `measurable` / `insufficient_data`), les interpolations sont reproductibles (paramètre `steps`, interpolation linéaire). La hiérarchie prédictive ne fait remonter que l'erreur pondérée par précision et reste avis seulement.

## Conséquences

- Positives : espace perceptif inspectable et interpolations rejouables ; erreur ascendante explicite sans écrasement du haut par le brut du bas.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; l'interpolation linéaire et la mesure de continuité sont rudimentaires.
- Neutres : valeurs non numériques filtrées à l'entrée, jamais inventées.

## Alternatives

- **Embedding opaque avec score unique** : rejetée — non inspectable, non rejouable.
- **Propagation d'erreur non pondérée** : rejetée — le bruit du bas aurait écrasé les niveaux supérieurs.
