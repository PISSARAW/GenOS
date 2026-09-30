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

## Branchement runtime des expériences causales persistantes

Les handlers de `primitiveHandlers/proceduralHandlers.js` exposent maintenant le
cycle persistant en plus des deux chemins de validation existants :

```text
procedural_causal_experiment_create
  → procedural_causal_fork_create
  → procedural_causal_replay
  → procedural_causal_diff
  → procedural_causal_analyze_snapshots
  → procedural_causal_graph
```

L'expérience lie des bras control/intervention, des snapshots sérialisés,
l'environnement, le runner et le budget. Chaque fork conserve son état et ses
événements dans SQLite. Le replay résout les références enregistrées par ID,
valide les empreintes, prend un lease conditionnel sur la version du checkpoint
et accepte une reprise après un checkpoint durable. Le diff n'accepte qu'une
paire terminée du même snapshot, seed et expérience. L'analyse multi-snapshots
charge uniquement des diffs persistés et des snapshots épinglés. Le graphe exige
des références persistées et limite explicitement l'attribution aux liens
observés. La migration `086-procedural-causal-experiments` crée/complète le
schéma et conserve la compatibilité des expériences précédentes.

Cette voie reste distincte de `procedural_causal_check`, du chemin répliqué et
du cycle général de promotion. L'exposition est celle du registre de primitives
et demeure soumise à la lease MCP; aucun résultat d'analyse ne promeut seul un
organisme.

La différence est importante :

- **Chemin simple actuel** : un essai par organisme et un score dérivé de
  `outcome` ; l'API de promotion conserve ce chemin à essai unique.
- **Chemin répliqué actuel** : plusieurs paires par seed, score binaire dérivé de
  `outcome`, reçu et incertitude t ; l'appel répliqué est distinct du cycle
  général de promotion.
- **Expériences persistantes branchées** : création de forks et reprise depuis
  checkpoint sont accessibles aux handlers runtime; elles ne constituent pas
  une preuve causale universelle.

## Choix adoptés pour l'instant

On conserve le nom **causal validation** pour le chemin simple et la primitive
MCP `procedural_causal_check`. Le replay persistant est nommé explicitement par
ses handlers et son protocole versionné; il ne remplace pas la gate de promotion.

Notes d'intention :

- Le chemin simple porte une **évidence comparative** (diff + verdict +
  isolation des snapshots) utilisée comme garde de promotion ; le terme ne
  signifie pas une preuve causale universelle.
- Le chemin répliqué porte une évidence expérimentale plus forte, limitée au
  protocole et à ses hypothèses ; il ne remplace pas le chemin de promotion.
- Les forks persistants ne doivent pas être décrits comme des univers physiques
  mutés; ils sont des états logiciels isolés, bornés au snapshot et au runner
  déclarés.
- La compatibilité ascendante avec les tests existants est préservée :
  `sameInitialState` reste dans le résultat, mais il est maintenant **prouvé**
  (snapshot hash), pas simplement affirmé.

## Limites restantes

Ce qui manque pour tenir le vocabulaire complet :

1. Le runner doit appeler le callback checkpoint avec un état compatible au
   premier checkpoint; les interruptions longues et reprises doivent encore
   être prouvées par un test qui redémarre réellement le processus.
2. L'analyse bootstrap hiérarchique a des hypothèses et un périmètre définis;
   elle ne démontre pas la généralisation au-delà des snapshots épinglés.
3. Le graphe conserve des relations déclarées et étayées, mais ne découvre pas
   les médiateurs internes et ne prouve pas à lui seul une causalité universelle.
4. Le nouveau cycle n'est pas encore une gate du chemin automatique de
   promotion; un diff positif reste une mesure expérimentale, non une autorité.

## Référence d'implémentation actuelle

- `backend/src/services/proceduralCausalValidationService.js`
- `backend/src/services/replicatedCausalValidationService.js`
- `backend/tests/test_procedural_causal_validation.js`
- `backend/tests/test_procedural_e2e_autonome.js` (scénario P0 → causal repair → P1)
- `backend/src/services/primitiveHandlers/proceduralHandlers.js` (primitives MCP `procedural_causal_check` et `procedural_replicated_causal_check`)
- `backend/src/services/proceduralCausalExperimentService.js`, `proceduralCausalReplayService.js`, `proceduralCausalAnalysisService.js`, `proceduralCausalGraphService.js`
- `backend/tests/test_procedural_causal_runtime_handlers.js` (expérience → forks → replay → diff → multi-snapshots → graphe)
- `backend/src/services/proceduralRegistryService.js` (résolution de runnerId / evaluatorId / environmentId / snapshotId, branchée aux handlers et au runtime : `procedural_evolve` accepte ces IDs sans fonctions dans le payload)
