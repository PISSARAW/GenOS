# Qualification des adaptateurs A/B

Date : 2026-10-27 (Europe/Paris)  
Statut : **parcours A/B exécutés; campagne comparative non validée**

| Condition | Cas | Répétitions | Exécutions | Exactitude oracle |
|---|---:|---:|---:|---:|
| A — exécuteur JSON de référence | 600 | 3 | 1 800 | 1 800/1 800 |
| B — compilateur + runtime G-CIR minimal | 600 | 3 | 1 800 | 1 800/1 800 |

B compile un graphe `READ → SELECT → CALL` avec `cognitiveOmegaCompiler`, puis l'exécute avec `cognitiveOmegaRuntimeService`. À part E03, le `CALL` réutilise le même handler déterministe que A. Les réponses identiques valident le raccordement du compilateur/runtime au contrat du résultat, mais ne mesurent pas la capacité de G-CIR à traduire ou améliorer une mission. Aucun appel modèle n'a été fait.

Ces sorties sont des qualifications d'adaptateurs sur un corpus synthétique public. Les latences ne sont pas interprétées comme gains de produit. C, D, les optimisations, l'intégration physiologique/morphogénétique et les familles concurrentes ne sont pas qualifiées ni lancées; il ne s'agit pas de la campagne complète de 7 200 exécutions.
