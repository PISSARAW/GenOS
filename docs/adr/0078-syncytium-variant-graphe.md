# ADR 0078 — Variant Graphe pour Syncytium

## Statut

Accepté — lot 19 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, graphes partagés, cohérence sémantique.

## Décideurs

Équipe GenOS.

## Lié à

Phase 37 de la feuille de route Syncytium.

## Contexte

Un graphe partagé doit préserver plus que les valeurs individuelles de ses nœuds et arêtes. Une arête doit relier des nœuds présents, la suppression d'un nœud ne doit pas laisser d'arête pendante et certains graphes doivent rester acycliques.

## Décision

1. Stocker nœuds et arêtes dans des champs `MAP` distincts du Shared State.
2. Représenter les propriétés du nœud ou de l'arête dans sa valeur de map, ce qui les versionne avec leur identité.
3. Exécuter les validations de références et de cycles dans le détecteur de conflits sémantiques commun.
4. Activer le contrôle d'acyclicité sur chaque ajout d'arête lorsque la requête déclare `acyclic: true`.
5. Rejeter la suppression d'un nœud tant que des arêtes le référencent; les arêtes doivent être retirées d'abord.

## Conséquences

### Positives

- Les opérations de graphe bénéficient du routage causal et de la persistance Syncytium.
- Les graphes orientés acycliques peuvent refuser un cycle avant application.
- Les identifiants de nœud et d'arête sont vérifiés par rapport à leur clé dans le `MAP`.

### Négatives

- La suppression d'un nœud et de toutes ses arêtes demande plusieurs opérations; un contrat de transaction graphe pourra les regrouper ultérieurement.
- L'acyclicité est une politique de la requête d'ajout, pas encore une propriété persistée au niveau du schéma de session.

## Alternatives

- Représenter le graphe comme une seule valeur JSON LWW : écarté, car les modifications indépendantes perdraient leur merge sémantique.
- Autoriser la suppression avec réparation automatique des arêtes : reporté jusqu'à la disponibilité de transactions multi-structures spécialisées.
