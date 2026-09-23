# Vocabulaire causal procédural — état réel vs ambitions GenOS

Ce document écrit ce que le code fait **maintenant**, ce qu'il est en droit de
dire, et ce qu'il faudrait faire pour tenir le vocabulaire complet GenOS.

## Ce qui est implémenté — prototype comparatif accouplé

Dans `backend/src/services/proceduralCausalValidationService.js` :

```text
runner(parent, S)
runner(candidate, S)
       ↓
trajectory diff   (temporalHelpers.findDivergences)
       ↓
causal comparison (baselineScore, candidateScore, scoreDelta, divergenceCount)
       ↓
causal verdict    (CAUSAL_IMPROVEMENT / CAUSAL_REGRESSION / NO_CAUSAL_EFFECT)
```

Propriétés actuelles :

- Les deux forks reçoivent une **copie indépendante** de l'état initial
  (deep clone avant exécution, un par fork ; comparaison
  `baselineStateHash === candidateStateHash` exposée dans `comparison`).
- Le verdict de promotion est bloqué si `divergenceCount === 0` ou
  `scoreDelta <= 0` (pas de faux positif de causalité).
- La preuve est attachée au candidat (`causal` dans l'assessment, visible dans
  `test_procedural_e2e_autonome.js`).

Ce prototype est **correct et défendable**, tant qu'on ne l'appelle pas encore
le système causal complet de GenOS.

## Ce que la documentation suggérait (et ce qui n'est pas encore câblé)

La docstring du service et le dossier GenOS parlent de :

```text
genos_causality_fork
mutatedUniverses
causalReplay
causalDiff
```

Ces mécanismes ne sont **pas** appelés directement par `proceduralCausalValidationService`.
Ce qui est réellement utilisé est `temporalHelpers.findDivergences` pour comparer
deux trajectoires.

La différence est importante :

- **Prototype actuel** : comparaison de trajectoires après exécution,
  couple baseline/candidate, état initial partagé mais cloné.
- **Système causal complet GenOS** : forks explicites d'un snapshot S,
  replay causal sur univers mutés, diff causal attribué, support stochastique,
  support async, support de plusieurs essais répétés.

## Choix adoptés pour l'instant

On conserve le nom **causal validation** pour le service, la primitive MCP
`procedural_causal_check`, et les termes `causalRunner` / `initialState` dans les
payloads. On ne prétend pas encore que ce soit le système causal complet.

Notes d'intention :

- Le service porte bien une **preuve causale minimale** (diff + verdict +
  snapshot isolation) suffisante pour rejeter les faux positifs de promotion.
- Il ne doit pas être décrit dans le README ou la doc comme
  `genos_causality_fork` / `mutatedUniverses` tant que l'appel n'est pas là.
- La compatibilité ascendante avec les tests existants est préservée :
  `sameInitialState` reste dans le résultat, mais il est maintenant **prouvé**
  (snapshot hash), pas simplement affirmé.

## Vers le système causal complet (non encore réalisé)

Ce qui manque pour tenir le vocabulaire complet :

1. **Fork de snapshot explicite** : snapshot S sérialisé, forkés en deux univers
   isolés, plutôt que deux appels de runner avec un clone.
2. **causalDiff / causalReplay** : mécanisme de replay causal avec état de fork
   traçable, divergences durables, attributions.
3. **Support stochastique** : plusieurs essais (seeds / snapshots comparables),
   moyenne des deltas, intervalle de confiance ou posterior.
4. **Support async** : le runner peut être asynchrone, le fork peut être long.
5. **Attributabilité** : la preuve doit pouvoir dire pourquoi le candidat diffère
   du baseline (pas seulement que les trajectoires diffèrent).

Quand ces points seront présents, on pourra remonter le vocabulaire
`causal fork` / `mutatedUniverses` / `causalDiff` depuis la doc vers le code.

## Référence d'implémentation actuelle

- `backend/src/services/proceduralCausalValidationService.js`
- `backend/tests/test_procedural_causal_validation.js`
- `backend/tests/test_procedural_e2e_autonome.js` (scénario P0 → causal repair → P1)
- `backend/src/services/primitiveHandlers/proceduralHandlers.js` (primitive MCP `procedural_causal_check`)
- `backend/src/services/proceduralRegistryService.js` (résolution de runnerId / evaluatorId / environmentId / snapshotId, branchée aux handlers et au runtime : `procedural_evolve` accepte ces IDs sans fonctions dans le payload)
