# ADR 0103 — Vecteur de fitness Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Holobionte, fitness, observabilité
- **Décideurs** : GenOS
- **Lié à** : ADR 0056, ADR 0060

## Contexte

Un score scalaire masque les compromis entre performance de l'hôte, sûreté,
redondance et dépendance. Il ne permet pas de savoir si une amélioration moyenne
cache une régression sur un invariant critique.

## Décision

Le service de fitness conserve dix dimensions normalisées séparément et exige des
références de preuve pour le vecteur entier. Il ne calcule aucun agrégat par défaut.
Une policy appelante peut définir explicitement son propre agrégat lorsqu'elle en
a besoin.

## Conséquences

### Positives

- Les compromis et régressions restent visibles dimension par dimension.
- Les mesures peuvent être retracées vers leurs preuves.

### Négatives

- Les consommateurs doivent interpréter plusieurs dimensions au lieu d'un score unique.
- Toute agrégation doit préciser sa policy.

## Alternatives

- Conserver un score composite comme vérité principale : rejeté, car il rend les pertes de sûreté ou de résilience compensables par d'autres dimensions.
