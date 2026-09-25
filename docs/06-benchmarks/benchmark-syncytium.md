# Protocole de benchmark Syncytium

Ce document décrit les métriques et l'agrégateur disponibles pour comparer Syncytium à d'autres variantes. Il s'agit d'un protocole de collecte : le service calcule des résultats à partir de compteurs fournis, mais n'exécute pas les scénarios et ne collecte pas les compteurs à la place de l'appelant.

## Métriques

Les compteurs sont agrégés par variante, puis les ratios sont calculés sur les sommes. Chaque exécution doit fournir les huit compteurs ci-dessous sous `counts`.

| Métrique | Numérateur | Dénominateur | Interprétation |
| --- | --- | --- | --- |
| `undetectedSemanticConflictRate` | `semanticConflictsMissed` | `realSemanticConflicts` | Part des conflits sémantiques réels qui n'ont pas été détectés. |
| `coordinationAvoidanceRatio` | `safeOperationsWithoutCoordination` | `safeOperationsEligible` | Part des opérations sûres éligibles exécutées sans coordination. |
| `invariantViolationEscapeRate` | `violationsPromotedOutsideSyncytium` | `invariantViolations` | Part des violations d'invariants promues hors de Syncytium. |
| `relevantSynchronizationEfficiency` | `relevantUpdatesDelivered` | `allUpdatesDelivered` | Part des mises à jour délivrées qui étaient pertinentes. |

Un ratio est marqué `measured: false` et sa valeur est `null` si son dénominateur vaut zéro. Chaque compteur doit être un entier sûr positif ou nul. Le numérateur ne peut dépasser le dénominateur.

## Format des exécutions

Chaque élément fourni à `evaluateMorphogenesisBenchmarks(runs)` suit cette forme :

```json
{
  "variant": "syncytium",
  "task": "shared-state-conflict",
  "budget": { "tokens": 10000, "steps": 100 },
  "counts": {
    "semanticConflictsMissed": 0,
    "realSemanticConflicts": 12,
    "safeOperationsWithoutCoordination": 8,
    "safeOperationsEligible": 10,
    "violationsPromotedOutsideSyncytium": 0,
    "invariantViolations": 4,
    "relevantUpdatesDelivered": 18,
    "allUpdatesDelivered": 20
  }
}
```

`variant`, `task`, `budget` et `counts` sont obligatoires. Le service retourne le nombre d'exécutions et les compteurs agrégés par variante. Le booléen global `equalBudget` indique si les budgets sont identiques entre les variantes pour chaque tâche ; il ne garantit pas à lui seul que les tâches ou les conditions expérimentales sont comparables.

## Limites d'interprétation

- Les compteurs doivent provenir de traces ou d'une instrumentation externe vérifiable. L'agrégateur ne valide pas leur provenance.
- Les résultats ne sont pas des mesures empiriques tant qu'une campagne reproductible n'a pas été exécutée et documentée.
- Une campagne devrait fixer à l'avance les tâches, variantes, budgets, répétitions et règles de comptage, puis publier les données brutes et les résultats agrégés.
- Les métriques ne suffisent pas isolément à établir la qualité globale d'une topologie ; elles doivent être interprétées avec les objectifs et les invariants de la tâche.

L'interface est implémentée dans `backend/src/services/syncytium/benchmark/syncytiumBenchmarkService.js` et exposée par le conseiller morphogénétique Syncytium.
