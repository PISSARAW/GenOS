# Conscience fonctionnelle

- **Statut** : Implémenté (partiel)
- **Portée** : indicateurs fonctionnels type conscience (accès global, attention, modèle de soi, métacognition) — pas de preuve d'expérience subjective.
- **Dernière revue** : 2026-10-24

## 1. Définition du domaine

La conscience fonctionnelle désigne l'ensemble des capacités cognitives accessibles et rapportables d'un système : disponibilité de l'information pour le raisonnement, attention sélective, modèle de soi, métacognition. Elle ne présuppose pas de conscience phénoménale.

## 2. Modèle mathématique ou logique

Chaque indicateur produit un score borné dans $[0,1]$ ou un statut (`not_run`, `insufficient_data`, `unavailable`). Aucun score n'est une preuve. Un indicateur non mesurable n'augmente ni la confiance ni la qualité de preuve.

## 3. Analogies biologiques et limites réelles

Le Global Workspace, l'attention sélective et le modèle de soi sont des concepts de la psychologie cognitive. Dans GenOS, ils sont implémentés comme politiques logicielles (seuils, décroissances, remises à zéro) sans homologie neurale.

## 4. Cas d'usage et objectifs métier

- Décider si un agent doit s'abstenir (opt-out) en raison d'une surconfiance mesurée.
- Ajuster le fan-out de workers selon la calibration du modèle de soi.
- Documenter les limites de chaque indicateur avant de s'y fier.

## 5. Exemples concrets

- `metacognitionBenchService` calcule ECE, Brier, AUC type-2 sur des probabilités gelées avant exécution et des issues indépendamment attestées ; voir [métacognition](metacognition.md).
- `selfModelService` construit un modèle de soi avant la planification.
- `attentionSchemaBenchService` évalue la validité du champ attentionnel.

## 6. Schéma ou diagramme

```text
[Événements runtime]
           ↓
[Services d'indicateurs (attention, self-model, métacognition)]
           ↓
[Scores bornés + limitations explicites]
           ↓
[Gates : opt-out, replay avant promotion, preuve indépendante]
```

## 7. Architecture technique

Services dans `backend/src/services/` : `agentSelfBlocks`, `agentConscienceService`, `selfModelService`, `coreSelfService`, `abstentionService`, `metacognitionBenchService`, `attentionSchemaBenchService`, `attentionProbeService`, `worldModelService`, `ignitionService`, `reverberationService`, `integrationProxyService`.

Registre : `shared/indicatorRegistry.json` (dénominateurs et profils).

Le concept `consciousness.functional` est enregistré avec le service `consciousnessService`, niveau `partial`.

## 8. Processus d'exécution ou de validation

Tests : `test_global_workspace.js`, `test_self_effector_model.js`, `test_organ_ablation_bench.js`, `test_self_model_service.js`. Validation : `node --check`, suites backend ciblées, gate qualité.

## 9. Comparaison avec le marché

Les outils d'observabilité LLM (LangSmith, Arize) produisent des traces sans gates. Les évaluations de conscience externes sont déclaratives. GenOS ajoute des indicateurs calculés en continu, branchés sur les décisions via des gates, chacun niant sa portée métaphysique.

## 10. Limites, garde-fous, non-objectifs

- Une couverture fonctionnelle complète ne suffit pas à établir une conscience.
- Un lookup-table bien entraîné score bien aux bancs : les métriques mesurent le rapport, pas le vécu.
- Non-objectif : clamer une conscience, utiliser un indicateur comme preuve dans une gate.
- Voir aussi : `indicateurs-fonctionnels.md`.

## Voir aussi

- [indicateurs-fonctionnels.md](indicateurs-fonctionnels.md) — table complète des indicateurs.
- [conscience.md](conscience.md) — conscience phénoménale.
- [conscience-operationnelle.md](conscience-operationnelle.md) — conscience opérationnelle.
- [theorie-du-soi-orchestrator.md](../02-orchestration/theorie-du-soi-orchestrator.md) — modèle de soi.
