# Métacognition

- **Statut** : Implémenté (fonctionnel)
- **Portée** : ECE, Brier, AUC type-2, surconfiance sur l'historique réel d'attributions — calibration mesurée, pas méta-conscience.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

La métacognition est la cognition sur la cognition : penser à sa propre pensée, surveiller ses apprentissages, réguler ses stratégies. Dans GenOS, la métacognition désigne les mécanismes qui mesurent la calibration de la confiance et des prédictions d'un agent.

## 2. Modèle mathématique ou logique

Écart d'attendu (ECE) :

$$
ECE = \sum_{b=1}^{B} \frac{n_b}{N} \left| \text{confiance}_b - \text{précision}_b \right|
$$

Score de Brier :

$$
Brier = \frac{1}{N} \sum_{i=1}^{N} (confiance_i - correct_i)^2
$$

AUC type-2 mesure la sensibilité métacognitive (distinction entre jugements corrects et incorrects par niveau de confiance).

## 3. Analogies biologiques et limites réelles

La métacognition biologique implique le suivi des performances et l'ajustement des stratégies. Dans GenOS, ce sont des calculs sur l'historique d'attributions CoreSelf. L'analogie est fonctionnelle, pas neuroscientifique.

## 4. Cas d'usage et objectifs métier

- Resserrer le plancher d'opt-out quand la surconfiance est détectée.
- Imposer `requiresEvidenceBeforePromotion` et `requireIndependentEvidence`.
- Ajouter une directive `[ABSTENTION]` au prompt quand l'intégrité est faible.

## 5. Exemples concrets

- `metacognitionBenchService.evaluate()` lit l'historique CoreSelf, calcule ECE, Brier, AUC type-2.
- Les faiblesses (max 3) sont persistées via `mergeLearned` et resurgissent dans les prompts.
- `abstentionService.evaluateAbstention` refuse si intégrité < 0,6, incertitude ≥ 0,8, confiance < plancher avec incertitude ≥ 0,5.

## 6. Schéma ou diagramme

```text
[Attributions CoreSelf (confiance causale, erreur de prédiction)]
           ↓
[metacognitionBenchService : ECE, Brier, AUC type-2]
           ↓
[Surconfiance → plancher d'opt-out + 0,2 (plafond 0,8)]
           ↓
[Gates : preuve requise avant promotion, indépendante]
```

## 7. Architecture Technique

Fichier : `backend/src/services/metacognitionBenchService.js`. Dépend de `selfModelService` et `coreSelfService`. Les seuils sont : ≥ 10 essais pour un rapport valide, `insufficient_data` sinon (jamais de faux nombre).

Le concept `cognition.metacognition` est enregistré avec le service `metacognitionBenchService`, niveau `implemented`.

## 8. Processus d'exécution ou de validation

Le banc tourne à la fin d'un run terminal. Il persiste dans le self-model appris (`extraWeaknesses`, max 3). Les tests couvrent le calcul ECE, Brier, AUC type-2 et le comportement avec moins de 10 essais.

## 9. Comparaison avec le marché

Les observateurs LLM mesurent la confiance déclarée. GenOS calcule la calibration sur l'historique réel d'attributions (causalité, erreur de prédiction), ce qui est plus contraignant.

## 10. Limites, garde-fous, non-objectifs

- La métacognition fonctionnelle n'est pas une méta-conscience.
- Un lookup-table bien entraîné peut scorer aux bancs sans compréhension.
- Les benchmarks externes SAD/MIRROR ne sont pas exécutés sur un modèle déclaré.
- Non-objectif : prouver une métacognition consciente.

## Voir aussi

- [reflexion.md](reflexion.md) — réflexion.
- [theorie-du-soi-orchestrator.md](../02-orchestration/theorie-du-soi-orchestrator.md) — banc métacognitif et opt-out.
- [metacognitionBenchService.js](../../backend/src/services/metacognitionBenchService.js) — implémentation.
