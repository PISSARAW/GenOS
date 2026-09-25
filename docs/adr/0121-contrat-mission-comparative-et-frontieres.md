# ADR 0121 — Contrat de mission comparative et frontières de responsabilité

## Statut

Accepté.

## Date

2026-09-25.

## Domaine

Contrats de mission, orchestration et évaluation comparative.

## Décideurs

Équipe GenOS.

## Lié à

[ADR 0047 — Sessions persistantes de Métapopulation](0047-sessions-persistantes-metapopulation.md).

## Contexte

Les missions comparatives nécessitent des entrées métier concrètes, des critères
de fitness locaux, des preuves et des limites reproductibles. Ces données ne
doivent pas être confondues avec les capacités mathématiques ou le runtime de
GenOS. Métapopulation ajoute des règles de migration, de diversité et de lignée
qui ne sont pas des garanties universelles des autres topologies.

## Décision

1. Définir un contrat versionné pour les missions comparatives et leurs
   résultats, validé à l'exécution par le backend.
2. Rendre explicites le problème, ses entrées, ses contraintes, son objectif,
   les méthodes, la fitness locale, les preuves, les règles de migration et les
   limites de reproduction.
3. Rejeter une migration acceptée sans validation positive par le receveur.
   Une solution copiée ne constitue pas une idée migrée validée.
4. Confier à GenOS l'exécution, l'isolation, les budgets et la conservation des
   preuves; à Métapopulation les dynamiques inter-populations; aux bancs d'essai
   les données, évaluateurs et métriques métier.
5. Permettre aux autres topologies d'utiliser le contrat commun sans leur
   imposer les politiques spécifiques à Métapopulation.
6. Ne pas ajouter implicitement grammaires de parseur, instances combinatoires
   ou pseudo-systèmes de sécurité au runtime. Ce sont des données versionnées de
   mission, fournies par un banc d'essai ou par l'appelant.

## Conséquences

Les résultats comparatifs ont un format vérifiable et les frontières
architecturales sont documentées. Le contrat est validé par le backend, mais
son intégration à tous les chemins d'orchestration et la livraison des bancs
d'essai restent à réaliser.

## Alternatives

- Laisser chaque topologie inventer son propre format de mission comparative :
  rejeté, car les résultats et preuves seraient difficiles à comparer.
- Ajouter les instances et évaluateurs métier au runtime central : rejeté, car
  cela confondrait exécution générique et définition du problème.

## ADR liés

- [ADR 0047 — Sessions persistantes de Métapopulation](0047-sessions-persistantes-metapopulation.md)
