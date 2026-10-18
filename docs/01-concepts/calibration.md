# Calibration

- **Statut** : Implémenté
- **Portée** : mise à jour lissée de la confiance, ECE, Brier — jamais plus permissive.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

La calibration est l'ajustement d'un système pour que ses degrés de confiance correspondent à sa précision observée. Dans GenOS, la calibration du modèle de soi met à jour la confiance de l'orchestrateur après chaque run terminal.

## 2. Modèle mathématique ou logique

Mise à jour lissée (pas de 0,2) :

$$
p_{t+1} = p_t + 0.2(a_t - p_t)
$$

où $p_t$ est la confiance prédite et $a_t$ le succès observé (0 ou 1). L'erreur absolue moyenne et le nombre d'observations sont conservés.

Métriques de calibration : ECE, Brier, AUC type-2, surconfiance.

## 3. Analogies biologiques et limites réelles

La calibration biologique ressemble à l'ajustement des attentes par l'expérience (apprentissage par renforcement). Dans GenOS, c'est une mise à jour algorithmique déterministe.

## 4. Cas d'usage et objectifs métier

- Ajuster la confiance de l'orchestrateur après chaque run.
- Ne jamais rendre une promotion plus permissive (la calibration ajoute des exigences, pas des dispenses).
- Détecter la surconfiance pour ajuster le plancher d'opt-out.

## 5. Exemples concrets

- `selfModelService.calibrate(db, runId)` met à jour `expectedSuccess`, `expectedCost`, `meanAbsoluteError`.
- `calibrationUpdate` calcule l'erreur : $|expectedSuccess - actualSuccess| + |expectedCost - actualCost|$.
- `recordRunAttribution` enregistre l'attribution d'agency (soi = exécution sans délégation).

## 6. Schéma ou diagramme

```text
[Run terminal (succès/échec, coût réel)]
           ↓
[calibrate : p ← p + 0.2(a − p)]
           ↓
[Observations++, meanAbsoluteError mis à jour]
           ↓
[Décision : promotion, replay, opt-out selon la confiance calibrée]
```

## 7. Architecture Technique

Fichier : `backend/src/services/selfModelService.js`. La calibration persiste dans `adaptive_state` avec le scope `orchestrator_self_model` et la clé de l'agent. Initialisation idempotente pour une base fraîche.

Le concept `cognition.calibration` est enregistré avec le service `selfModelService`, niveau `implemented`.

## 8. Processus d'exécution ou de validation

Test : `backend/tests/test_self_model_service.js` vérifie la calibration persistée, la détection de sur-délégation, la réduction de fan-out, l'exigence de replay.

## 9. Comparaison avec le marché

Les frameworks d'agents n'ont généralement pas de calibration persistée de la confiance liée à des portes de preuve (replay, preuve indépendante avant promotion).

## 10. Limites, garde-fous, non-objectifs

- La calibration ne rend jamais une promotion plus permissive.
- L'historique est borné aux 12 derniers runs.
- Une métrique absente n'est pas inventée.
- Non-objectif : modéliser une calibration consciente.

## Voir aussi

- [theorie-du-soi-orchestrator.md](../02-orchestration/theorie-du-soi-orchestrator.md) — modèle de soi et calibration.
- [selfModelService.js](../../backend/src/services/selfModelService.js) — implémentation.
- [metacognition.md](metacognition.md) — banc métacognitif.
