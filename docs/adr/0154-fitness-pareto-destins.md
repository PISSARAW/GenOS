# ADR 0154 — Fitness, Pareto et destins multiples

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Sélection multi-objectifs, fitness, niches
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/fitnessParetoDestinyService.js` (`evaluate`, `dominates`)
  - Tests : `../../backend/tests/test_fitness_pareto_destiny.js`
- **Note** : collision numérique avec `0154-recu-typé-du-pont-rust-snapshot.md` (même numéro, sujet distinct ; renumérotation interdite sans migration de provenance, voir ADR 0005 — traiter dans l'index, jamais par `git mv`).

## Contexte

Des candidats invalides ou inconnus pouvaient être promus avec les valides, et la comparaison mono-objectif écrasait les alternatives au lieu de conserver les niches.

## Décision

Les candidats inconnus sont séparés (`unknown`) et interdisent la promotion (`promotionAllowed` exige zéro inconnu et un front non vide). Les candidats valides sont comparés par dominance multi-objectifs (fitness et métriques) ; la frontière conserve les niches et attribue un destin par candidat du front (`destiny`, niche ou `candidate`) sans écraser les alternatives (dominés listés séparément).

## Conséquences

- Positives : promotion bloquée sur inconnu, frontière de Pareto conservant les niches, destins traçables.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; dominance stricte sur métriques brutes, sans normalisation ni diversité explicite.
- Neutres : un candidat exige `id`, fitness finie et tableau de métriques pour être valide.

## Alternatives

- **Promotion avec inconnus** : rejetée — autorisait des candidats non évaluables.
- **Sélection mono-objectif** : rejetée — écrasait les niches et les alternatives.
