# Réflexion

- **Statut** : Partiel
- **Portée** : auto-surveillance de la confiance et des erreurs — mesure du rapport, pas réflexivité phénoménale.
- **Dernière revue** : 2026-10-24

## 1. Définition du domaine

La réflexion est le retour de l'esprit sur lui-même : penser sa propre pensée. En phénoménologie (Sartre, Husserl), c'est la conscience réfléchie qui prend un état mental comme objet. Dans GenOS, la réflexion désigne les mécanismes d'auto-surveillance : métacognition, calibration, modèle de soi.

## 2. Modèle mathématique ou logique

La réflexivité peut être modélisée comme une fonction d'ordre supérieur : une opération qui prend un état cognitif en entrée et produit une évaluation de cet état (confiance, erreur, biais). Les métriques (ECE, Brier, AUC type-2) quantifient cette auto-évaluation.

## 3. Analogies biologiques et limites réelles

La réflexion biologique implique le cortex préfrontal et l'auto-surveillance. Dans GenOS, la calibration compare des prévisions antérieures à l'exécution et des issues indépendamment vérifiées. L'analogie est structurelle, pas phénoménale.

## 4. Cas d'usage et objectifs métier

- Détecter la surconfiance d'un agent et resserrer le plancher d'opt-out.
- Mesurer les biais de délégation, de promotion prématurée, de churn stratégique.
- Ajuster la politique de décision avant le lancement d'une mission.

## 5. Exemples concrets

- `metacognitionBenchService` calcule ECE, Brier, AUC type-2 sur ≥ 10 prévisions résolues par des preuves indépendantes signées.
- `selfModelService` détecte les biais (`over_delegation`, `premature_promotion`, `strategy_churn`, `budget_myopia`).
- Les faiblesses mesurées (max 3) persistent et resurgissent dans les prompts.

## 6. Schéma ou diagramme

```text
[Prévisions gelées et issues indépendamment signées]
           ↓
[metacognitionBenchService : ECE, Brier, AUC type-2, surconfiance]
           ↓
[Faiblesses (max 3) → mergeLearned → prompts]
           ↓
[Plancher d'opt-out resserré (abstentionService)]
```

## 7. Architecture technique

Fichiers : `backend/src/services/metacognitionBenchService.js`, `backend/src/services/selfModelService.js`, `backend/src/services/abstentionService.js`.

Le concept `cognition.reflection` est enregistré avec le service `metacognitionBenchService`, niveau `partial`.

## 8. Processus d'exécution ou de validation

Test : `backend/tests/test_self_model_service.js` vérifie la calibration, les biais, le fan-out. Le banc métacognitif exige ≥ 10 essais, sinon `insufficient_data`.

## 9. Comparaison avec le marché

Les frameworks d'agents n'ont généralement pas de banc métacognitif adversarial qui mesure la calibration sur l'historique réel. GenOS lie les résultats à des décisions de planification (opt-out, replay, preuve indépendante).

## 10. Limites, garde-fous, non-objectifs

- La réflexion fonctionnelle n'est pas une réflexivité phénoménale.
- Les métriques mesurent le rapport de confiance, pas la conscience de soi.
- Les benchmarks externes (SAD/MIRROR) ne sont pas exécutés sur un modèle déclaré.
- Non-objectif : modéliser la conscience réflexive.

## Voir aussi

- [metacognition.md](metacognition.md) — métacognition.
- [theorie-du-soi-orchestrator.md](../02-orchestration/theorie-du-soi-orchestrator.md) — modèle de soi et banc métacognitif.
- [metacognitionBenchService.js](../../backend/src/services/metacognitionBenchService.js) — implémentation.
