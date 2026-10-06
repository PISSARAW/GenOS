# ADR 0339 - Traces LeanDojo-v2 et invariants Dafny

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : preuve formelle, budgets, leases

## Décision

Enregistrer les états et tactiques de recherche LeanDojo-v2 sans transformer
le résultat de recherche en verdict. Seule l'exécution Lean du fichier de
preuve complet peut marquer une preuve vérifiée. Modéliser séparément dans
Dafny l'atténuation d'une lease et la dépense d'un budget, puis vérifier ce
modèle avec le compilateur Dafny.

## Limites

La vérification du modèle Dafny n'établit pas l'équivalence du code JavaScript
ou Rust existant. Les tests de conformité du runtime et les reçus GenOS
restent nécessaires. LeanDojo-v2 et Lean ne sont pas lancés par le test local
sans leur environnement de preuve.
