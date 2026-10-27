# Qualification des adaptateurs A/B

Date : 2026-10-27 (Europe/Paris)  
Statut : **parcours A/B exécutés; campagne comparative non validée**

| Condition | Cas | Répétitions | Exécutions | Exactitude oracle |
|---|---:|---:|---:|---:|
| A — exécuteur JSON de référence | 600 | 3 | 1 800 | 1 800/1 800 |
| B — compilateur + runtime G-CIR minimal | 600 | 3 | 1 800 | 1 800/1 800 |

B compile un graphe `READ → SELECT → CALL` avec `cognitiveOmegaCompiler`, puis l'exécute avec `cognitiveOmegaRuntimeService`. À part E03, le `CALL` réutilise le même handler déterministe que A. Les réponses identiques valident le raccordement du compilateur/runtime au contrat du résultat, mais ne mesurent pas la capacité de G-CIR à traduire ou améliorer une mission. Aucun appel modèle n'a été fait.

Ces sorties sont des qualifications d'adaptateurs sur un corpus synthétique public. Les latences ne sont pas interprétées comme gains de produit. C, D, les optimisations, l'intégration physiologique/morphogénétique et les familles concurrentes ne sont pas qualifiées ni lancées; il ne s'agit pas de la campagne complète de 7 200 exécutions.

## Relance après correction de traçabilité

Les deux adaptateurs ont été relancés depuis la révision `03245bbc749485c00ab625b873557fa625f5c315`. L'évaluateur indépendant (`src/evaluate.py`) confirme pour A et B, dans chacune des expériences E01–E12, **150/150 sorties conformes**, sans exécution manquante, répétition dupliquée, statut invalide ni échec critique. Les deux manifestes enregistrent la même empreinte du manifeste du corpus (`38ec8816b703a95c0af32b77086285773d70386df85ac84196e62824777c0c2f`).

La correction ajoutée à l'adaptateur B garantit maintenant cette empreinte dans son manifeste. Le résultat reste une qualification fonctionnelle : B réutilise les handlers déterministes de A hors E03, et aucun appel de modèle n'a été effectué. La campagne comparative complète reste non lancée.
