# Théorie du soi de l'orchestrator

- **Statut** : Implémenté
- **Portée** : modèle de soi et calibration de l'orchestrator dans le control plane Node.
- **Dernière revue** : 2026-09-26

## Statut d'implémentation

Implémenté dans le control plane Node.js par `selfModelService`. Le modèle est
reconstruit avant la planification, persiste sa calibration par orchestrator et
impose des contraintes sur le fan-out et la promotion. Il ne représente ni une
personnalité, ni une preuve à lui seul.

## But

La théorie du soi donne à l'orchestrator un modèle situé de ses capacités, de
ses limites et de sa fiabilité observée. Une décision est donc évaluée contre
la mission et contre l'état mesuré de l'agent.

```text
mission + état du monde + historique de l'orchestrator
                    -> SelfModel
                    -> contraintes de planification et de promotion
```

## Trois couches

| Couche | Contenu | Source calculée |
| --- | --- | --- |
| Identité stable | rôle, mode d'exécution, workspace | enregistrement `agents` |
| État courant | énergie, stress, confiance, incertitude, fatigue, intégrité | budget, profil de mission et historique récent |
| Histoire apprise | calibration, biais, forces et faiblesses | `strategy_execution_runs` et état persistant |
| Frontière soi/monde (CoreSelf) | calibration d'agency, dernières attributions, ratio d'origine | historique d'attributions, claims épistémiques (optionnel) |

Le modèle produit aussi les capacités et leases visibles, les topologies
disponibles et les limites de budget/fan-out. Les champs dérivés sont bornés
dans l'intervalle $[0,1]$.

## Persistance et calibration

L'état appris est stocké dans `adaptive_state` avec le scope
`orchestrator_self_model` et une clé égale à l'identifiant de l'agent. Le
service initialise ce stockage de façon idempotente pour une base fraîche.

À la fin d'un run terminal, le service compare une prédiction lissée de succès
et de coût avec le résultat observé. La mise à jour utilise un pas de $0.2$ :

$$
p_{t+1} = p_t + 0.2(a_t - p_t)
$$

La calibration conserve le nombre d'observations, l'erreur absolue moyenne et
le dernier run traité. Elle ajuste la confiance de façon graduelle; elle ne
rend jamais une promotion plus permissive. Chaque run terminal enregistre
aussi une attribution d'agency (`coreSelfService`, scope `core_self`) :
erreur de prédiction = |succès attendu − succès observé|, soi = exécution
sans délégation. L'agency calibrée vaut 1 − erreur moyenne (20 dernières
attributions) ; le ratio d'origine soi est omis sans données au lieu d'être
inventé. `mergeLearned` fusionne des correctifs (faiblesses mesurées) dans
l'état appris sans écraser la calibration.

## Banc métacognitif et opt-out

`metacognitionBenchService` mesure la calibration sur l'historique réel
d'attributions (≥ 10 essais) : ECE, Brier, AUC type-2, surconfiance. Les
faiblesses mesurées (max 3) persistent via `mergeLearned` et ressurgissent dans
les prompts ; la surconfiance resserre le plancher d'opt-out
(`abstentionService.floorFor`, plafond 0,8). La règle d'abstention
(`abstentionService.evaluateAbstention` : intégrité < 0,6, incertitude ≥ 0,8,
confiance < plancher avec incertitude ≥ 0,5) impose `requiresEvidenceBeforePromotion`,
resserre `requireIndependentEvidence` (gate automatique) et ajoute une directive
`[ABSTENTION]` au prompt. C'est une mesure du rapport de confiance, pas une
preuve de métacognition consciente.

## Biais mesurés et garde-fous

| Biais | Signal | Réponse |
| --- | --- | --- |
| `over_delegation` | au moins 4 workers et score de preuve inférieur à 0.5 | réduire le fan-out d'un worker |
| `premature_promotion` | run terminé avec dette de garde-fou | replay obligatoire et strictesse de preuve accrue |
| `strategy_churn` | proportion de runs failed/blocked/cancelled | inertie stratégique accrue, intégrité diminuée |
| `budget_myopia` | tokens réels supérieurs au budget | faiblesse mémorisée et stress accru |

Les seuils sont des garde-fous explicites, révisables et testables. Une force
connue fournit du contexte, mais ne court-circuite jamais les portes de preuve.

## Effet sur les décisions

Avant le lancement, `agentAutonomyPlanService` ajoute `selfModel`,
`selfAssessment` et `selfModelPolicy` au plan et à la mission. Si le modèle
identifie une tendance à la sur-délégation ou une fatigue importante, il réduit
le plafond de workers en passant par la contrainte de survie existante.

Lors d'une promotion différée, `strategyExecutionService` recharge le modèle.
Il refuse la promotion si la politique requiert un replay ou une preuve
indépendante absente. Les politiques du contrat, l'approbation humaine et le
confinement du workspace restent obligatoires; le SelfModel ne peut qu'ajouter
des exigences.

La synthèse injectée est courte et structurée : niveau d'incertitude, énergie,
faiblesse prioritaire et posture recommandée, par exemple
`cautious_probe_then_branch` ou `repair_quarantine`.

## Limites

- L'historique est borné aux 12 derniers runs pour éviter une rigidité et
  laisser les observations récentes modifier l'état.
- Une métrique absente n'est pas inventée : elle n'augmente pas artificiellement
  la confiance ou la qualité de preuve.
- Le modèle n'évalue pas la vérité fonctionnelle d'une modification. Les tests,
  replay, artefacts et approbations restent les sources de décision.

## Validation

`backend/tests/test_self_model_service.js` vérifie une calibration persistée,
la détection de sur-délégation, la réduction de fan-out et l'exigence de replay.
