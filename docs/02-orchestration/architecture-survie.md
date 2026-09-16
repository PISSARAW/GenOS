# Architecture de survie de l'orchestrator

- **Statut** : Partiel
- **Portée** : control plane Node, plan autonome et corps de l'orchestrator
- **Dernière revue** : 2026-09-16

## Définition

La survie est la capacité à poursuivre une mission sans épuiser le budget, perdre
l'intégrité, propager une conclusion non prouvée ou saturer la population de
workers. Elle contraint la planification normale ; elle ne remplace ni la mission
ni les barrières de preuve.

`survivalModelService.js` dérive un état borné dans `[0, 1]` : viabilité, énergie,
intégrité, cohérence, adaptabilité, santé mémoire, potentiel de reproduction,
menace, toxicité, incertitude, conflit, stagnation, isolement et perte d'habitat.
Le nombre de workers et la capacité porteuse restent des entiers positifs.

## Chaîne de décision

```text
WorldState + profil + télémétrie explicite
  -> SurvivalState
  -> SurvivalPressureDetector
  -> SurvivalPolicy
  -> contraintes de planification
  -> plan normal
  -> corps et réflexes audités
```

Le plan sérialise le diagnostic sous le schéma `genos.survival/v1alpha1`.
Une classification contractuelle `risk: high` n'est pas convertie en menace
observée : `threatLevel` doit provenir d'un signal explicite.

## Pressions et politiques

| Pression | Signal principal | Action ou contrainte |
| --- | --- | --- |
| `starvation` | énergie `< 0,25` | conserver, outils sobres, fan-out 1 ou 2 |
| `infection` | toxicité `>= 0,70` | quarantaine et preuve indépendante |
| `injury` | intégrité `< 0,55` | plan de réparation causale |
| `predation` | menace `>= 0,70` | quarantaine et revue humaine |
| `overgrowth` | workers > capacité porteuse | borner le fan-out |
| `isolation` | isolement `>= 0,70` | demander un helper si l'énergie le permet |
| `conflict` | conflit `>= 0,65` | exiger une preuve indépendante |
| `senescence` | santé mémoire `< 0,50` | demander l'élagage mémoire |
| `habitat_loss` | perte d'habitat `>= 0,70` | migration et dormance |
| `stagnation` | stagnation `>= 0,70` | mutation contrôlée, blast radius 1 |

Sous énergie `< 0,08`, `cryptobiosis_suspend` interdit tout nouveau worker et
marque la mission `dormant`. La condition de réveil et le snapshot effectif
restent à fournir par les services de résilience ; le runtime ne prétend pas
qu'un snapshot existe sans reçu.

## Contrôles actifs

`buildAutonomyPlan()` applique `homeostasis_guard` avant de composer les workers.
La garde est réappliquée après Trinity ou A-Team, puis recalcule l'allocation de
tokens et la décision de dispatch. Elle ne remplace pas le contrôle séparé
d'abordabilité.

Le corps publie les réflexes suivants :

- `homeostasis_guard` : contraindre le plan ;
- `immune_challenge` : quarantaine et preuve indépendante avant promotion ;
- `cryptobiosis_suspend` : demander snapshot et suspension ;
- `regeneration_plan` : demander isolation, restauration et validation ;
- `validated_strategy_reproduction` : demander la distillation d'un trait validé.

La reproduction exige `independentlyValidated: true`, une cohérence `>= 0,80`,
un potentiel `>= 0,80` et une menace `< 0,25`. Elle produit une intention auditée,
pas une promotion automatique.

## Exemple d'entrée

```json
{
  "executionBudget": { "tokens": 2400, "minimumWorkerTokens": 800 },
  "survivalState": {
    "uncertainty": 0.8,
    "memoryNoise": 0.2,
    "threatLevel": 0.1,
    "carryingCapacity": 4
  }
}
```

Ce cas limite le fan-out à deux avant la planification. L'abordabilité peut
encore réduire ce nombre.

## Limites et garde-fous

- Les seuils sont déterministes et locaux, pas appris automatiquement.
- Réparation, migration, élagage et reproduction sont des demandes tant qu'un
  exécuteur ne fournit pas de reçu typé.
- La viabilité est un indicateur de contrôle, jamais une preuve de réussite.
- Une action de survie ne contourne ni sandbox, ni lease, ni gate de promotion.
- La télémétrie post-action et les conditions de réveil persistées restent à
  implémenter avant de qualifier la boucle de survie de complète.

Voir [ADR 0013](../adr/0013-survival-model-control-plane.md) et
[corps-orchestrator.md](corps-orchestrator.md).