# Plugins de topologies morphogénétiques

- **Statut** : Implémenté
- **Portée** : câblage des 8 topologies au `MorphologyRuntime` via `installTopologyPlugins`
- **Dernière revue** : 2026-09-26

---

## 1. Contrat

`installTopologyPlugins(runtime)` enregistre une implémentation
`{ topology, run({ variant, workers }, context) }` par topologie, sans
auto-montage caché. Le `TopologyExecutor` préfère un exécuteur dédié, sinon
délègue au registre, sinon refuse (`Topology not registered`). Code :
`backend/src/services/morphogenesis/runtime/topologyPlugins.js`.

## 2. Matrice de câblage

| Topologie | Mécanisme | Persistance | Vérifié |
| --- | --- | --- | --- |
| Trinity | `TrinityController` (3 chambres, `verified_claims`) | non | gate §5 |
| A-Team | `ATeamController` (3 sous-systèmes) | non | gate §5 |
| Rhizome | `RhizomeController` (exploration, compteur déterministe) | non | gate §5 |
| Syncytium | `SyncytiumController` (état partagé, convergence déterministe) | non | gate §5 |
| Biocénose | `BiocenoseController` (jury, ballots explicites) | non | gate §5 |
| Biome | `populationRuntimeService` (`create→spawn→advance`) sur écologie in-memory construite des workers/input | non | gate §5 |
| Holobionte | `runCycle` réel (migrations, provisioning session+constitution+symbiont+contrat, planner, exécuteur, ledger, mémoire, health) | Base persistante du control plane GenOS | gate §5 |
| Métapopulation | `runAutonomousRegionalRuntime` réel (session créée, adapters du `regionalBrain`, cycle `OBSERVE→…→VERIFY→RECORD`) | Base persistante du control plane GenOS | gate §5 |

## 3. Contrats d'entrée des feuilles

| Topologie | Entrée requise | Sans elle |
| --- | --- | --- |
| Trinity, Rhizome, Syncytium, A-Team, Biome | rien (défauts `{}`) | s'exécute (résultat possiblement vide) |
| Biocénose | `ballots[role] = { vote: approve/reject, confidence? }` | `Biocenose juror … requires an explicit ballot` |
| Holobionte | `capability` + `executeCapability(fn)` + `allocation{policy,available}` | message d'exigence explicite |
| Métapopulation | texte mission (`input.mission`, sinon `missionId` du graphe) | `metapopulation requires a mission text` |

Un jury ne vote jamais sans ballot ; une capacité symbiotique ne s'exécute
jamais sans exécuteur fourni par la mission. L'input mission traverse les
opérateurs jusqu'aux feuilles (pass-through quand le parent n'a pas produit
de sortie) ; à l'intérieur de `SEQUENCE`/`NEST`, une feuille reçoit la
sortie de l'étape/hôte précédent, pas l'input mission.

## 4. Exigence SQLite

Holobionte et Métapopulation utilisent la base persistante partagée du control
plane (`getDatabase()`), configurée par `GENOS_DB_PATH` ou les chemins par
défaut de GenOS. Les migrations sont idempotentes et exécutées sur cette base;
le plugin ne ferme pas la connexion partagée. Le stockage dépend donc du
backend SQLite configuré pour le control plane et non d'une base de test
` :memory: `.

## 5. Preuves

- Test versionné sans stubs ni SQLite :
  `backend/tests/test_morphology_graph_execution.js`
  (`NEST(A-Team,PARALLEL(Trinity,Rhizome))`,
  `SEQUENCE(PARALLEL,GATE,A-Team)`, fail-closed).
- Protocole à 8 avec SQLite :
  `docs/06-qualite-preuves/morphogenese-gates-2026-09-26.md`.
- Décision : `docs/adr/0133-graphe-morphologique-executable-et-plugins-topologies.md`.

## 6. Limites

- Les contrôleurs sont des modèles in-process simplifiés, pas les runtimes
  lourds (sessions distribuées, CRDT réseau, jury humain).
- Le cycle Métapopulation sur région vide rend `VERIFIED` avec
  `actionCount 0` : reçu honnête d'inactivité, pas preuve d'efficacité.
- `changeVariant` ne vérifie pas les règles de transition du
  `variantRegistry` (gain/coût) : il applique un patch vérifié
  structurellement, pas une décision apprise.
