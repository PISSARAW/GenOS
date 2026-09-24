# ADR 0094 — Calibration du plan immunitaire Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, immunité, épistémologie
- **Décideurs** : GenOS
- **Lié à** : ADR 0057, ADR 0093

## Contexte

Les décisions AEIS doivent être comparées aux résultats vérifiés lorsqu'un oracle
ou une preuve future indépendante devient disponible. Les décisions seules ne
permettent pas de distinguer faux positifs et faux négatifs.

## Décision

Le service de calibration accepte uniquement des verdicts `SAFE` ou `UNSAFE`
confirmés par un vérificateur avec références de preuve. Il calcule la matrice de
confusion (vrais/faux positifs et négatifs) et les taux associés. L'absence de
vérité terrain produit des métriques indisponibles. Ces mesures n'altèrent jamais
automatiquement une gate AEIS.

## Conséquences

### Positives

- La calibration repose sur des résultats vérifiés plutôt que sur les décisions AEIS seules.
- Les faux positifs et faux négatifs sont quantifiés séparément.

### Négatives

- Les métriques restent indisponibles tant qu'aucune vérité terrain n'est attestée.
- Un opérateur doit décider si une calibration appelle une revue de politique.

## Alternatives

- Apprendre automatiquement à partir des décisions de l'AEIS : rejeté, car cela confondrait prédiction et oracle.
