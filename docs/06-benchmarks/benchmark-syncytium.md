# Protocole de benchmark Syncytium

Ce document distingue l'agrégateur de métriques et le runner de missions. L'agrégateur calcule des ratios à partir de compteurs fournis. Le runner lance une comparaison entre `isolated_baseline` et `syncytium`, collecte les reçus disponibles et évalue un oracle indépendant sur la session Syncytium. Aucun résultat des 53 missions réelles n'est attesté à ce jour. Le [protocole des missions](../02-orchestration/topologies/protocole-missions-syncytium.md) décrit les budgets, les workers et les limites de preuve.

## Métriques

Les compteurs sont agrégés par variante, puis les ratios sont calculés sur les sommes. Chaque exécution doit fournir les huit compteurs ci-dessous sous `counts`.

| Métrique | Numérateur | Dénominateur | Interprétation |
| --- | --- | --- | --- |
| `undetectedSemanticConflictRate` | `semanticConflictsMissed` | `realSemanticConflicts` | Part des conflits sémantiques réels qui n'ont pas été détectés. |
| `coordinationAvoidanceRatio` | `safeOperationsWithoutCoordination` | `safeOperationsEligible` | Part des opérations sûres éligibles exécutées sans coordination. |
| `invariantViolationEscapeRate` | `violationsPromotedOutsideSyncytium` | `invariantViolations` | Part des violations d'invariants promues hors de Syncytium. |
| `relevantSynchronizationEfficiency` | `relevantUpdatesDelivered` | `allUpdatesDelivered` | Part des mises à jour délivrées qui étaient pertinentes. |

Un ratio est marqué `measured: false` et sa valeur est `null` si son dénominateur vaut zéro. Chaque compteur fourni à l'agrégateur doit être un entier sûr positif ou nul ; le numérateur ne peut dépasser le dénominateur. Le runner conserve `null` pour les compteurs qu'il ne sait pas mesurer, notamment les opérations sûres sans coordination, les violations promues et les livraisons de mises à jour. Ces valeurs ne sont pas des zéros observés.

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

## Runner de campagne et matrice

`backend/bin/genos-biological-benchmark.cjs` reçoit un manifeste JSON en argument. Un manifeste individuel précise `mission`, `variantId`, `repetitions`, `budget` par worker (`tokens` et `costUsd` obligatoires), `campaignBudget`, `expectedClaims` et l'oracle de session. Il peut préciser `caseId`, `configuration`, `workerAssignments`, `timeoutMs`, `scenarioTimeoutMs` et `sessionOptions`. Le runner valide les plafonds avant le dispatch, lance le baseline isolé puis Syncytium pour chaque répétition, attend les workers, contrôle les claims et évalue l'oracle sur l'état et les reçus persistés. `comparable` exige notamment budgets et nombres de workers égaux, exécutions valides et dépenses vérifiées. `complete` exige aussi les claims attendus et, pour Syncytium, l'oracle.

Une matrice fournit exactement 53 manifestes sous `cases` et un `matrixBudget` couvrant la somme de leurs plafonds. Chaque `caseId`, `variantId` et énoncé doivent correspondre au [catalogue versionné](../../backend/fixtures/syncytium/missionCatalog.json) ; le 53e cas est transversal. Le contrôle préalable refuse les doublons, les cas absents, les oracles vides et les plafonds insuffisants avant de lancer un worker. Le rapport contient `expectedCases`, `executedCases`, `missing`, `failed`, `observed`, `reports` et `pass`. Un cas qui lève une erreur est inscrit dans `failed` et les cas suivants restent tentés, sauf dépassement de `maxRuntimeMs`. `pass` exige les 53 cas, leurs comparaisons valides, tous les runs Syncytium complets et les usages agrégés mesurés sous le plafond.

Les reçus `AGENT_COMPLETED` et les événements fournisseur `AGENT_STEP` doivent fournir explicitement tokens et coût. Une valeur absente reste `null` et empêche la vérification du budget ; elle n'est jamais convertie en coût nul. L'oracle générique sait vérifier état, révision, opération appliquée/absente et rejet codé. Il ne remplace pas les assertions propres à chaque mission ni une preuve de convergence par réplica pour le cas transversal. Les 53 manifestes exécutables et leurs oracles spécifiques restent à produire.

## Limites d'interprétation

- Les compteurs doivent provenir de traces ou d'une instrumentation externe vérifiable. L'agrégateur ne valide pas leur provenance.
- Le runner disponible n'est pas une mesure empirique à lui seul : la campagne doit être exécutée et ses reçus conservés. Le dernier probe LLM documenté dans le protocole a échoué sur l'accès WebSocket.
- Une campagne devrait fixer à l'avance les tâches, variantes, budgets, répétitions et règles de comptage, puis publier les données brutes et les résultats agrégés.
- Les métriques ne suffisent pas isolément à établir la qualité globale d'une topologie ; elles doivent être interprétées avec les objectifs et les invariants de la tâche.

L'agrégateur est implémenté dans `backend/src/services/syncytium/benchmark/syncytiumBenchmarkService.js` et exposé par le conseiller morphogénétique. Le runner et la matrice résident dans `biologicalBenchmarkRunnerService.js` et `syncytiumMissionMatrixService.js` du même dossier.
