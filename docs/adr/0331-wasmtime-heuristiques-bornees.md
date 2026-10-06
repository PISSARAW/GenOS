# ADR 0331 - Exécution Wasmtime des heuristiques bornées

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : plugins, GVX, isolation

## Décision

Le premier contrat Wasmtime autorise une fonction pure `score(i32) -> i32` sans
import hôte. Le module est limité en taille, mémoire et fuel. Aucun accès WASI
ou privilège du worker hôte n'est transmis. Un résultat calculé n'est jamais
une preuve de validité ni une autorisation de promotion GVX.

## Conséquences

Cette interface couvre des scores numériques simples. Les heuristiques riches
et les candidats nécessitant des effets externes exigent un contrat distinct,
des permissions explicites et une évaluation indépendante.
