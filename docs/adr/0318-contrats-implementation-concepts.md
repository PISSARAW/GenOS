# ADR 0318 — Contrats d’implémentation des concepts

- Statut : Accepté
- Date : 2026-10-05
- Domaine : registre philosophique, épistémologie, expérimentation
- Lié à : [ADR 0018](0018-gouvernance-registre-philosophique.md), [ADR 0319](0319-raccord-contrats-philosophiques-ontogenese.md)

## Contexte

### Évolution du 2026-10-06

Cette décision décrit le premier lot historique (21 pilotes, 354 mappings).
[ADR 0326](0326-audits-philosophiques-executables-et-preuves.md) complète le
compilateur par 375 profils d'audit exécutables et des expériences rejouables.
Les mentions `mapped-pending-behavior` et « uniquement des lectures » ci-dessous
décrivent donc l'état initial, pas le catalogue courant. La maturité de base
reste `mechanism-linked` : les tests de fixtures ne prouvent pas les invariants
philosophiques complets ni l'utilité sur missions réelles. La distinction entre
contrat, preuve et autorité demeure inchangée.

Le registre contient 375 entrées, mais une entrée philosophique ne décrit pas
encore nécessairement un changement observable du runtime. Le registre ne doit
ni devenir 375 modules, ni présenter une analogie comme une capacité validée.

## Décision

Introduire un contrat d’implémentation séparé du concept. Un contrat décrit une
interprétation opérationnelle, un invariant, un mécanisme partagé, des cibles,
des observables, des tests de falsification, des limites et des responsabilités.

Le compilateur produit un contrat pour chacune des 375 entrées. Il distingue
21 contrats pilotes détaillés et 354 contrats provisoires marqués
`mapped-pending-behavior`; ces derniers ne peuvent pas être annoncés comme
implémentés. Le routeur expose uniquement des lectures : liste, contrat unique,
santé, préparation expérimentale et vérification des preuves manquantes. Ces
opérations n’accordent aucune autorité runtime.

Chaque expérience compare la topologie de référence `isolated_critics` à des
variantes centralisée, fédérée et pair-à-pair ; cette déclaration ne vaut pas
encore résultat expérimental.

## Conséquences

- les contrats sont comparables et testables sans multiplier les modules ;
- la maturité `tested` est distincte du statut philosophique du concept ;
- une absence de contrat est visible plutôt que remplacée par une promesse ;
- l’extension aux autres entrées devra fournir des tests et des limites.
- le raccord à l’Ontogenèse doit transporter le contrat comme contexte de
  mission sans créer de lease ni contourner les gates (voir ADR 0319).
