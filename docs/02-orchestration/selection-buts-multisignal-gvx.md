# Sélection multisignal des buts GVX

## Portée implémentée

Le service `backend/src/services/gvxGoalSelector.js` arbitre des propositions
de buts avant leur planification ou leur dispatch. Il complète la détection de
lacunes : il ne remplace ni le planificateur de curriculum, ni un exécuteur,
ni une gate de promotion.

Chaque candidat fournit :

- un `goalId` stable et un `estimatedCost` positif ;
- les signaux `projectNeed`, `trajectoryGap`, `risk`, `opportunity`,
  `uncertainty` et `learningProgress` ;
- pour chaque signal, une valeur dans `[0, 1]` et au moins une `sourceRef` ;
- une provenance avec `candidateRef` et `observedAt`.

Le score additionne les six contributions pondérées et soustrait le coût
normalisé. Les poids par défaut donnent davantage de place au besoin projet,
à l'écart de trajectoire et au risque qu'au seul progrès d'apprentissage. Ils
sont exposés dans `DEFAULT_WEIGHTS` et restent une politique à calibrer, pas un
résultat scientifique.

## Barrières non compensables

Avant le classement, l'adaptateur d'autorité reçoit le but, la portée tenant,
le coût estimé et la permission `goal:propose`. Toute réponse autre que
`true` produit `permission_denied`. Un coût supérieur au budget produit
`budget_exceeded`. Aucun score élevé ne peut compenser ces refus.

Le classement est déterministe : utilité décroissante, coût croissant, puis
identifiant lexical. La sélection respecte `maxCost` et `maxGoals`.

## Option `NO_CHANGE`

`noChangeUtility` représente explicitement l'utilité de ne rien changer. Un
candidat doit la dépasser et atteindre `minUtility`. Si aucun candidat ne
survit aux barrières et à cette comparaison, le reçu contient :

```json
{
  "decision": "NO_CHANGE",
  "status": "no_change",
  "selected": [],
  "noChange": { "utility": 0, "selected": true }
}
```

Les évaluations rejetées restent présentes pour permettre l'audit et la
falsification du choix.

## Frontière d'exécution et de preuve

Une sélection positive produit seulement des hypothèses portant
`execution: requires_external_dispatch` et
`promotion: requires_independent_evidence`. Le reçu global fixe
`autonomousExecution: false` et `promotionAuthorized: false`.

Le sélecteur n'écrit pas dans le registre GVX, ne lance pas un worker et ne
transforme pas une référence de source en preuve vérifiée. L'appelant doit
encore employer les contrats de curriculum, d'autorité, d'exécution et de
promotion appropriés.

## Vérification locale

```bash
node backend/tests/test_gvx_goal_selector.js
```

Ce test falsifie notamment la domination du progrès d'apprentissage seul, le
contournement des permissions, l'absence de `NO_CHANGE`, le dépassement de
budget, la perte de provenance et l'indéterminisme des égalités.
