# ADR 0646 — Responsabilité de trajectoire à double preuve

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : autonomie, SHEV, trajectoire projet, apprentissage, autorité
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0295, ADR 0297, ADR 0626

## Contexte

Une conversation persistante peut conserver du contexte et proposer une action,
mais cela ne démontre ni qu'elle reste responsable d'un objectif externe, ni que
son action a amélioré le projet. GenOS possède déjà les mandats et observations
SHEV ainsi que la pensée endogène bornée. Il manquait un contrat étroit qui relie
explicitement ces éléments à un arbitrage entre agir, observer, apprendre et ne
rien faire, puis distingue l'effet projet de l'apprentissage de l'agent.

## Décision

Introduire une responsabilité de trajectoire en trois frontières :

1. `trajectoryStewardshipPolicyService` dérive un mode parmi `ACT`, `OBSERVE`,
   `LEARN` et `NO_CHANGE`. L'objectif endogène contient toujours la référence de
   l'objectif externe et de l'observation. Une permission ou un budget absent
   produit `NO_CHANGE` ; `ACT` exige en plus un lease d'écriture explicite.
2. `trajectoryStewardshipStoreService` scelle la responsabilité et ses domaines
   dans un registre SQLite isolé par organisation et projet. Les lignes sont
   immuables et append-only ; la réutilisation divergente d'un identifiant échoue.
3. `trajectoryStewardshipOutcomeService` ne marque `PROMOTED` que si une preuve
   d'effet sur l'objectif projet et une preuve d'apprentissage de l'agent sont
   toutes deux `supported`, portent sur les bons sujets et proviennent de deux
   vérificateurs et références distincts. L'écriture consomme une autorisation
   SHEV Ed25519 à usage unique liée aux deux preuves.

Les verdicts `REJECTED` et `INCONCLUSIVE` sont conservés comme résultats normaux.
Un transport réussi, une exécution terminée ou une preuve unique ne vaut pas
promotion.

## Conséquences

### Positives

- la continuité conversationnelle devient une responsabilité de projet
  inspectable, et non une mémoire implicite ;
- l'agent peut explicitement décider d'observer, d'apprendre ou de ne rien faire ;
- l'effet externe et l'apprentissage interne ne peuvent plus se certifier avec
  le même oracle ;
- les décisions et résultats survivent au redémarrage et restent isolés par
  tenant.

### Négatives

- deux tables et deux migrations supplémentaires sont nécessaires ;
- l'autorité SHEV et deux sources de preuve indépendantes sont requises pour une
  promotion ;
- cette tranche n'ordonnance pas encore automatiquement les objectifs produits
  et ne constitue pas une campagne longitudinale de terrain.

## Alternatives

- **Réutiliser seulement ETT** : rejeté, car ETT prouve un épisode cognitif mais
  ne sépare pas l'effet sur l'objectif projet de l'apprentissage de l'agent.
- **Promouvoir sur la seule réussite technique** : rejeté, car le succès du
  transport ou des tests ne prouve pas l'effet externe recherché.
- **Confier l'arbitrage au prompt** : rejeté, car les permissions, budgets et
  résultats `NO_CHANGE` ne seraient pas des invariants exécutables.

## Vérification

- `node backend/tests/test_trajectory_stewardship_policy.js`
- `node backend/tests/test_trajectory_stewardship_store.js`
- `node backend/tests/test_trajectory_stewardship_outcome.js`
- `python scripts/ci/check_code_quality.py`
