# ADR 0340 - Commandes compactes sous XGrammar

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : décodage contraint, outils, budgets

## Décision

Expérimenter une grammaire EBNF de commandes `READ` et `SCORE` avec XGrammar.
Le compilateur est lié au vocabulaire du modèle ; le parseur et la politique
d'autorité restent appliqués après génération. Comparer modes libre et contraint
sur les mêmes tâches, erreurs de format, réparations et tokens.

## Limites

Le test local compile un vocabulaire jouet, sans moteur d'inférence. La
conformité syntaxique ne démontre ni la bonne décision ni l'autorisation.
Aucune API distante dépourvue de décodage contraint n'est déclarée compatible.
