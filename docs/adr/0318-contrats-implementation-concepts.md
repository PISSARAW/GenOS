# ADR 0318 — Contrats d’implémentation des concepts

- Statut : Accepté
- Date : 2026-10-05
- Domaine : registre philosophique, épistémologie, expérimentation
- Lié à : [ADR 0018](0018-gouvernance-registre-philosophique.md)

## Contexte

Le registre contient 375 entrées, mais une entrée philosophique ne décrit pas
encore nécessairement un changement observable du runtime. Le registre ne doit
ni devenir 375 modules, ni présenter une analogie comme une capacité validée.

## Décision

Introduire un contrat d’implémentation séparé du concept. Un contrat décrit une
interprétation opérationnelle, un invariant, un mécanisme partagé, des cibles,
des observables, des tests de falsification, des limites et des responsabilités.

Le compilateur produit un contrat pour chacune des 375 entrées. Il distingue
21 contrats pilotes détaillés et 354 contrats provisoires marqués
`pending-mechanism`; ces derniers ne peuvent pas être annoncés comme
implémentés. Le routeur expose uniquement des lectures : liste, contrat unique
et santé du registre. Ces opérations n’accordent aucune autorité runtime.

## Conséquences

- les contrats sont comparables et testables sans multiplier les modules ;
- la maturité `tested` est distincte du statut philosophique du concept ;
- une absence de contrat est visible plutôt que remplacée par une promesse ;
- l’extension aux autres entrées devra fournir des tests et des limites.
