# ADR 0049 — Graphe morphologique et contrats typés de topologie

## Statut

Proposé — migration additive en cours.

## Date

2026-09-24

## Domaine

Orchestration, morphogenèse, topologies, preuves, budget.

## Décideurs

Équipe GenOS.

## Lié à

- [ADR 0040 — Morphogenèse versionnée Git et contrefactuelle](0040-morphogenese-git-contrefactuel.md)
- [ADR 0045 — Noyau de contrôle morphogénétique de l'orchestrateur Rust](0045-noyau-controle-morphogenetique.md)

## Contexte

Le runtime expose encore un choix topologique plat (`selectedTopology`) tandis que
la composition attendue doit représenter des sous-organisations, des liens de
communication, d'autorité, d'état, de preuve, de ressources et de migration.
Le contrat de capacités actuel décrit surtout des capacités requises et un profil
simple; il ne suffit pas à exprimer les sémantiques nécessaires à la composition.
Les organisations historiques comme `red_blue_coevolution` décrivent des
patterns ou des politiques au-dessus des primitives topologiques.

Une migration immédiate casserait les consommateurs existants et présenterait
comme exécutables des fonctions encore conceptuelles.

## Décision

1. Introduire `MorphologyGraph` avec des nœuds typés et des arêtes typées. Le
   containment et l'autorité restent validables comme hiérarchies acycliques;
   les communications et autres relations sont des liens transversaux explicites.
2. Compiler le runtime plat existant en un graphe trivial à nœud racine, tout en
   continuant d'émettre `selectedTopology`, `morphologyGraphRef` et
   `morphologyPatch` pendant la transition.
3. Étendre les contrats de topologie de façon additive avec sémantiques,
   capacités, transitions et contraintes de composition; séparer les primitives
   topologiques des variants et patterns d'organisation.
4. Garder la sélection et l'exécution liées aux preuves et aux budgets. Une
   morphologie n'est déclarée que valide et meilleure connue sous les éléments
   disponibles; aucune optimalité globale n'est supposée.
5. Persister les snapshots versionnés du graphe dans SQLite, sous contrainte
   d'augmentation monotone des versions. Livrer les autres capacités par
   incréments.

## Conséquences

### Positives

- Les organisations composites disposent d'une représentation pouvant exprimer
  des liens qui ne sont pas de containment.
- Le runtime plat reste représentable pendant la migration.
- Les patterns historiques peuvent être réutilisés comme paramètres ou policies
  sans multiplier les identifiants de topologies primitives.

### Négatives

- Des consommateurs doivent migrer avant que les champs plats puissent devenir
  de simples projections du graphe.
- Les snapshots sont durables et immuables par version; les mutations produisent
  une nouvelle version du graphe.
- Le graphe et les contrats typés n'implémentent pas à eux seuls l'exécution
  récursive ou la reconfiguration en direct.

## Alternatives

- Remplacer directement `selectedTopology` : rejeté, car les consommateurs
  existants ne sont pas encore migrés.
- Représenter toutes les relations par une arborescence : rejeté, car cela
  confond containment et communication ou échange de preuves.
- Traiter chaque pattern d'organisation comme une nouvelle topologie : rejeté,
  car cela dupliquerait les primitives et ferait croître le registre sans borne.
