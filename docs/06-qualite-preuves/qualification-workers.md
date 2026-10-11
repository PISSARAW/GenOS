# Qualification vérifiable des workers

- **Statut** : En cours. La matrice native et les contrats sont testés ; la qualification complète définie ici n'est pas acquise.
- **Date de l'inventaire** : 2026-10-10.
- **Portée** : les 19 `WorkerKind`, les méthodes du registre Node, les missions persistées et leurs preuves.

## Niveaux de preuve

| Niveau | Ce qu'il établit | Ce qu'il ne démontre pas |
|---|---|---|
| C0 — contrat | Identité, méthode, autorité et artefact déclarés cohérents. | Lancement réel. |
| C1 — méthode | Exécution sur fixture et refus des entrées ou artefacts altérés. | Dispatch, persistance et supervision réels. |
| C2 — mission | Entrée mission, contrat persistant, bail, runtime, run et preuve terminale liés. | Justesse métier indépendante. |
| C3 — oracle | Résultat contrôlé par un oracle distinct ou une évaluation humaine documentée. | Réussite de toute mission libre. |
| C4 — robustesse | Répétitions et fautes injectées sur environnements explicités. | Garantie statistique hors des conditions mesurées. |

Une méthode n'est dite qualifiée que si C0 à C3 passent pour sa tâche bornée.
C4 est rapporté séparément avec le nombre d'essais et les échecs. Aucun statut
`unavailable`, `unmeasured` ou `skipped` ne vaut réussite.

## Inventaire exécutable

`node backend/tests/workerQualificationInventory.cjs` produit l'inventaire du
registre, des artefacts et des cas du benchmark avec son digest SHA-256. Le test
`test_worker_qualification_inventory.js` refuse un type sans exécuteur ou cas,
un identifiant dupliqué et une méthode de benchmark non enregistrée. L'inventaire
actuel contient **19 types, 24 méthodes et 20 cas de benchmark**.

La matrice `test_worker_native_matrix.js` exécute une méthode par type avec
artefact typé et provenance, soit C1 pour ces 19 couples type-méthode. Ses
enfants de sous-orchestrateur empruntent un transport simulé. Les méthodes
supplémentaires `verify_memory_fidelity`, `verify_code_postconditions`,
`formal_proof` et `theorem_proving`, ainsi que le second algorithme du worker
procédural, exigent leurs propres reçus d'exécution et oracles. Le test Lean
unitaire injecte un exécuteur ; une qualification formelle exige Lean réel.

Les neuf cas de benchmark sans oracle sont `bounded-code`, `adaptive-shift`,
`specialist-niche`, `host-bound`, `creative-candidate`, `medical-education`,
`recovery-state`, `liaison-delivery` et `subgraph-delegation`. Leur exécution
éventuelle doit rester `unmeasured` jusqu'à l'ajout d'une vérification distincte.
Le candidat créatif peut être contrôlé sur son contrat et évalué selon une
grille explicite ; son originalité universelle n'est pas déductible d'une fixture.
Le cas médical reste synthétique et pédagogique, sans validation clinique.

## Portes de qualification à implémenter

1. **Rapport reproductible** : lier chaque campagne à un commit propre, aux
   versions Node, Rust, Lean et modèle, au digest des cas, à la configuration,
   aux sorties et aux codes de sortie. Un checkout modifié est exploratoire.
2. **Missions réelles** : exécuter chaque type depuis `startMission`, avec
   SQLite, parent, Garage, bail, workspace, événement terminal et artefact
   de la tentative courante. Refuser les preuves d'un run antérieur.
3. **Oracles indépendants** : donner un oracle aux neuf cas ci-dessus et
   séparer le code de l'oracle de celui de l'exécuteur pour les autres cas qui
   se vérifient encore en relançant le même module.
4. **Collectif et perception** : exercer deux enfants réels, les huit
   topologies applicables, la barrière et deux changements externes par mode
   d'exécution. Un digest observé n'atteste pas la connaissance du contenu.
5. **Répétition** : qualifier la contention SQLite, le redémarrage, le gel et
   la reprise sur Windows et Linux, en conservant chaque résultat d'essai.

La campagne `run_worker_compliance_missions.cjs` refuse désormais tout type
requis indisponible et son résumé exige un lancement, un contrat, un parent,
un artefact et une provenance validés. Elle requiert une racine isolée hors
dépôt et un modèle local explicite pour les méthodes qui l'utilisent ; une
méthode native enregistrée peut s'exécuter sans modèle.
Elle n'est pas incluse dans la simple matrice native.

Le test d'intégration `test_worker_compliance_native_missions.js` lance deux
missions dans deux bases SQLite et racines temporaires distinctes. Le cas
`bounded_worker` avec `scoped_procedure → subset_sum`, confirmé le 2026-10-11,
a atteint C2 : deux vérificateurs natifs indépendants ont accepté
le résultat, le run persistant est `completed`, et l'événement terminal,
l'artefact et la provenance sont liés à cette tentative. L'agent redevient
`idle` après la fermeture normale ; le statut du run et l'événement terminal
font foi.

Le cas `formal_worker` de ce test atteint l'événement terminal `AGENT_FAILED`
avec `ORACLE_DOMAIN_UNAVAILABLE` et sans promotion. Une exécution exploratoire
antérieure avait produit un `formal_certificate` avant ce refus. Le harnais
compte donc ce cas comme échec C2. Un essai `procedural_executor → subset_sum`
a également révélé `ORACLE_DOMAIN_UNAVAILABLE` : l'oracle existant ne couvre
que la méthode
encapsulée `scoped_procedure`. La suite du plan doit étendre les domaines
d'oracle et fournir des reçus indépendants liés à chaque tentative ; supprimer
la porte de promotion fausserait la preuve. Une erreur intermittente de
persistance des snapshots de télémétrie (`ENOENT`) apparaît dans ces essais ;
elle doit être éliminée avant un verdict C4.

Le 2026-10-11, `test:workers` a passé ses 23 suites, la porte de qualité n'a
signalé aucune nouvelle violation et `cargo test --workspace` a terminé avec
le code 0. Deux passages de `npm test` n'ont pas donné de verdict global vert :
le premier a expiré dans `test_aeis_production_adapters.js`, le second a reçu
`SQLITE_BUSY` dans `test_native_memory_budget.js`. Ces deux tests ont passé
isolément après leur échec. Cette intermittence et les avertissements de
télémétrie empêchent de conclure à C4.

## Commandes et limites du verdict

```text
node backend/tests/workerQualificationInventory.cjs
node backend/tests/test_worker_compliance_native_missions.js
npm --prefix backend run test:workers
npm run test:garage
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Un passage de ces commandes ne remplace pas les missions C2, les oracles C3
ou les répétitions C4. Le résultat publié doit conserver les sorties exactes,
leurs codes de sortie et les échecs. Voir aussi
[l'exécution native](../03-reference/execution-native-workers.md),
[les types](../03-reference/types-de-workers.md) et
[la campagne comparative](../../benchmarks/workers/README.md).
