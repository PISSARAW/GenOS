# 0133 — Graphe morphologique exécutable et plugins de topologies

- **Statut** : Accepté
- **Date** : 2026-09-26
- **Domaine** : Orchestration, morphogenèse, runtime, preuve
- **Décideurs** : Équipe GenOS
- **Lié à** : [0051](0051-morphology-graph-and-topology-contracts.md),
  [0076](0076-runtime-morphogenese-v2.md), [0108](0108-branchement-topologies-fail-closed.md)

## Contexte

Le `MorphologyGraph` était un artefact descriptif joint au plan historique
(`morphogenesisPlannerService` sélectionne une topologie unique,
`compileFlatTopology` aplatit, le graphe est attaché en `replace_root`).
Les opérateurs existaient sans sémantique d'exécution garantie
(`PARALLEL = Promise.all`), les feuilles `TOPOLOGY` n'avaient aucun
exécuteur branché, et `patchOperations.applyOperation` n'invoquait jamais
ses handlers (aucune mutation ne s'appliquait, en silence).

## Décision

1. Le graphe devient une IR compilée et exécutable : expression →
   validation → normalisation → budgets subdivisés → aplatissement avec
   `children[]`, ports typés, frontières et politiques → contrôles
   structure/type/budget avec refus fermé (`morphologyCompiler.js`,
   `morphologyTypeChecker.js`, `morphologyBudgetChecker.js`).
2. Les 8 opérateurs ont une sémantique réelle (barrière de jointure, gates
   post-étape, états isolés, reçus de décision, budgets comparables,
   contrats `BRIDGE` fail-closed, quorum `FEDERATE`) et chaque nœud émet un
   reçu avec dossier de preuve distinct.
3. Les 8 topologies sont câblées par plugins explicites
   (`installTopologyPlugins`, opt-in, pas d'auto-montage) : 5 contrôleurs
   in-process, Biome in-memory réel, Holobionte/Métapopulation sur runtimes
   réels persistés (SQLite natif sinon repli `node:sqlite` déclaré).
   Contrats d'entrée des feuilles imposés avec refus fermé (ballots,
   `capability`, mission).
4. `MorphologyRuntime.applyPatch` (pipeline complet avec contrefactuel et
   rollback) et `changeVariant` (patch vérifié, sans reconstruction) ;
   enregistrement best-effort dans le magasin d'expérience.
5. Déterminisme des contrôleurs (plus de `Math.random`/`Date.now` dans les
   décisions) ; `applyOperation` sur opérateur inconnu lève au lieu
   d'ignorer.

## Conséquences

Positives :

- `NEST`, `PARALLEL`, `SEQUENCE` (+ `GATE`, `COMPETE`) s'exécutent
  réellement sur les 8 topologies, avec preuves et budgets (test
  `backend/tests/test_morphology_graph_execution.js`).
- Doctrine fail-closed étendue : topologie inconnue, contrat `BRIDGE`
  violé, quorum manqué, ballot manquant, capability manquante.

Négatives :

- Holobionte/Métapopulation exigent SQLite ; le repli `node:sqlite`
  (expérimental) est déclaré dans les reçus.
- Les contrôleurs restent des modèles simplifiés ; le planificateur
  historique reste mono-topologie ; les boucles de contrôle ne sont pas
  tickées ; les priors du résolveur ne sont pas calibrés.

## Alternatives

- Câbler les runtimes lourds avec `db` factice : rejeté (succès faké,
  contraire à la règle transport ≠ décision).
- Laisser les 3 topologies persistées non câblées : rejeté, l'algèbre
  restait incomplète et le §46 de `morphogenese.md` faux par omission.
- Deep RL sur les priors : rejeté, prématuré sans données (stats
  empiriques d'abord).
