# ADR 0444 — Produire les enfants Quality-Diversity depuis les élites admises

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : Biome, Quality-Diversity, archive des élites

## Contexte

Le contrôleur Quality-Diversity conservait la meilleure qualité par cellule,
mais créait un enfant recombiné même lorsque le nouveau candidat était rejeté
par cette archive. La file pouvait alors présenter une stratégie issue d'un
candidat moins bon comme si elle provenait d'une élite admise.

## Décision

Un candidat ne contribue à la file des enfants que lorsqu'il devient la
nouvelle élite de sa cellule. Un candidat rejeté conserve son verdict et ses
mesures de comparaison, sans stratégie d'enfant ni ajout à la file.

## Conséquences

La filiation de la file reste cohérente avec l'archive persistée. Les enfants
restent des propositions : l'évaluation de fitness, la vérification des
références de preuve et leur exécution appartiennent à des étapes distinctes.

## Alternatives

Autoriser la reproduction de tous les candidats aurait requis un modèle
distinct de filiation et de sélection hors archive. Ce modèle n'existe pas
dans le runtime actuel.
