# Vocabulaire causal procédural — état réel vs ambitions GenOS

Ce document écrit ce que le code fait **maintenant**, ce qu'il est en droit de
dire, et ce qu'il faudrait faire pour tenir le vocabulaire complet GenOS.

## Comparaison simple et répliquée : état implémenté

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

Propriétés du chemin simple :

- Les deux forks reçoivent une **copie indépendante** de l'état initial
  (deep clone avant exécution, un par fork ; comparaison
  `baselineStateHash === candidateStateHash` exposée dans `comparison`).
- Le verdict de promotion est bloqué si `divergenceCount === 0` ou
  `scoreDelta <= 0` (pas de faux positif de causalité).
- La preuve est attachée au candidat (`causal` dans l'assessment, visible dans
  `test_procedural_e2e_autonome.js`).

### Comparaison procédurale répliquée

`proceduralCausalValidationService.validateReplicatedCausally` adapte aussi les
organismes au protocole répliqué de `replicatedCausalValidationService` :

- chaque seed exécute baseline et candidat sur des clones indépendants du même
  snapshot sérialisé ; les exécutions sont appariées par seed ;
- l'environnement est engagé par le hash SHA-256 du manifeste et chaque résultat
  doit confirmer seed, environnement, métrique finie, trajectoire et budget ;
- au moins trois seeds distincts sont obligatoires ; le delta moyen apparié, son
  erreur standard et son intervalle t à 95 % sont consignés dans un reçu ;
- le verdict d'amélioration n'est rendu que si la borne basse de l'intervalle est
  strictement positive. Une expérience inconclusive ne constitue pas une preuve
  positive ;
- l'attribution est explicitement bornée à l'intervention organisme, au runner,
  snapshot, manifeste, seeds et budget déclarés.

La primitive `procedural_replicated_causal_check` expose ce parcours. Elle
résout les identifiants `runnerId`, `snapshotId` et `environmentId` du registre,
et accepte soit des bras génériques `control`/`intervention`, soit les organismes
`parent`/`candidate`. Dans le second cas, les résultats `outcome` sont convertis
en métrique binaire (succès = 1, toute autre sortie = 0) et `turns` en
trajectoire.
L'expérience et son reçu sont persistés quand elle est appelée par le handler
avec une base SQLite.

Cette extension permet une affirmation expérimentale plus forte qu'un essai
unique, mais l'intervalle t suppose des différences appariées approximativement
normales. Elle n'établit ni une causalité universelle ni l'exactitude du modèle
de l'environnement. Le chemin simple `validateCausally` et la promotion actuelle
restent à essai unique ; il ne faut pas les présenter comme répliqués.

Ce prototype est **correct et défendable**, tant qu'on ne l'appelle pas encore
le système causal complet de GenOS.

## Parcours produit des expériences causales persistées

La primitive de production `causal_diff` / `diff` du registre temporel accepte
maintenant les identifiants `baselineForkId` et `interventionForkId`. Elle charge
les deux forks terminés, vérifie leur paire (expérience, snapshot, seed, bras),
valide les hashes des résultats et persiste le diff. Avec `experimentId` et des
groupes `snapshotId` / `diffIds`, le même handler calcule et persiste ensuite
l'analyse bootstrap hiérarchique des différences appariées. Les snapshots doivent
être épinglés dans l'expérience et les diffs doivent déjà exister.

Ce parcours reste borné aux snapshots, runner, environnement, budget et seeds
déclarés. Il ne prouve pas la causalité universelle et ne remplace pas le chemin de
promotion procédurale à essai unique.

## Ce que la documentation suggérait (et ce qui n'est pas encore câblé)

La docstring du service et le dossier GenOS parlent de :

```text
genos_causality_fork
mutatedUniverses
causalReplay
causalDiff
```

Ces mécanismes ne sont **pas** appelés directement par `proceduralCausalValidationService`.
Le chemin simple utilise `temporalHelpers.findDivergences`; le chemin répliqué
compare les trajectoires appariées par seed via `replicatedCausalValidationService`.
Ni l'un ni l'autre ne crée encore des univers persistants ni un replay causal
général. Le parcours des expériences explicitement persistées passe par le handler
temporel `causal_diff`; il reste distinct du service de validation et du gate de
promotion.

La différence est importante :

- **Chemin simple actuel** : un essai par organisme et un score dérivé de
  `outcome` ; l'API de promotion conserve ce chemin à essai unique.
- **Chemin répliqué actuel** : plusieurs paires par seed, score binaire dérivé de
  `outcome`, reçu et incertitude t ; l'appel répliqué est distinct du cycle
  général de promotion.
- **Système causal complet GenOS** : forks explicites d'un snapshot S,
  replay causal sur univers mutés et diff causal attribué. Les répétitions
  asynchrones existent dans le protocole expérimental borné, sans replay durable.

## Choix adoptés pour l'instant

On conserve le nom **causal validation** pour le service, la primitive MCP
`procedural_causal_check`, et les termes `causalRunner` / `initialState` dans les
payloads. On ne prétend pas encore que ce soit le système causal complet.

Notes d'intention :

- Le chemin simple porte une **évidence comparative** (diff + verdict +
  isolation des snapshots) utilisée comme garde de promotion ; le terme ne
  signifie pas une preuve causale universelle.
- Le chemin répliqué porte une évidence expérimentale plus forte, limitée au
  protocole et à ses hypothèses ; il ne remplace pas le chemin de promotion.
- Il ne doit pas être décrit dans le README ou la doc comme
  `genos_causality_fork` / `mutatedUniverses` tant que l'appel n'est pas là.
- La compatibilité ascendante avec les tests existants est préservée :
  `sameInitialState` reste dans le résultat, mais il est maintenant **prouvé**
  (snapshot hash), pas simplement affirmé.

## Limites restantes avant le système causal complet

Ce qui manque pour tenir le vocabulaire complet :

1. **Fork de snapshot explicite** : snapshot S sérialisé et traçable, forké en
   deux univers isolés, plutôt que des clones en mémoire passés au runner.
2. **causalDiff / causalReplay** : mécanisme de replay causal avec état de fork
   traçable, divergences durables, attributions.
3. **Généralisation** : plusieurs snapshots indépendants et protocole de
   rééchantillonnage ou analyse robuste aux différences non normales.
4. **Exécution durable** : reprise et persistance des états de fork individuels
   lors d'une interruption longue (le runner async et l'annulation sont déjà
   supportés, mais pas la reprise).
5. **Attributabilité** : le reçu localise les pas divergents, mais ne relie pas
   encore ces changements à un graphe causal interne ni à un mécanisme médiateur.

Quand ces points seront présents, on pourra remonter le vocabulaire
`causal fork` / `mutatedUniverses` / `causalDiff` depuis la doc vers le code.

## Référence d'implémentation actuelle

- `backend/src/services/proceduralCausalValidationService.js`
- `backend/src/services/replicatedCausalValidationService.js`
- `backend/tests/test_procedural_causal_validation.js`
- `backend/tests/test_procedural_e2e_autonome.js` (scénario P0 → causal repair → P1)
- `backend/src/services/primitiveHandlers/proceduralHandlers.js` (primitives MCP `procedural_causal_check` et `procedural_replicated_causal_check`)
- `backend/src/services/proceduralRegistryService.js` (résolution de runnerId / evaluatorId / environmentId / snapshotId, branchée aux handlers et au runtime : `procedural_evolve` accepte ces IDs sans fonctions dans le payload)
