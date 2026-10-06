# Plugins de topologies morphogénétiques

- **Statut** : Implémenté
- **Portée** : câblage des 8 topologies au `MorphologyRuntime` via `installTopologyPlugins`
- **Dernière revue** : 2026-10-06 (Métapopulation)

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
| Holobionte | `runHolobiontMission` partagé avec la CLI : hôte, contrat, admission, exécution, vérification indépendante, gate immunitaire, contribution/mémoire atomiques, santé et clôture | Base persistante du control plane GenOS | gate §5 et contrat Holobionte |
| Métapopulation | `runAutonomousRegionalRuntime` réel : PLAN sans effet, VERIFY par relecture et RECORD atomique ; cycle vide `NO_ACTION` | SQLite du control plane ; état des cycles reprenable | gate §5 et suite Metapopulation |

Le plugin Rhizome de cette matrice conserve un contrôleur in-process simplifié. Le [runtime Rhizome persistant](runtime-rhizome.md) possède un cycle distinct avec providers réels, preuves indépendantes et budgets atomiques ; ces garanties ne sont pas acquises par la seule feuille MorphologyRuntime.

## 3. Contrats d'entrée des feuilles

| Topologie | Entrée requise | Sans elle |
| --- | --- | --- |
| Trinity, Rhizome, Syncytium, A-Team, Biome | rien (défauts `{}`) | s'exécute (résultat possiblement vide) |
| Biocénose | `ballots[role] = { vote: approve/reject, confidence? }` | `Biocenose juror … requires an explicit ballot` |
| Holobionte | `capability` ou `steps` + `executeCapability(fn)` + `verifyCapability(fn)` + `allocation{policy,available}` ; `trialCapabilityExecutor(fn)` pour un nouveau candidat | refus explicite avant exécution si un adaptateur ou une allocation manque |
| Métapopulation | texte mission (`input.mission`, sinon `missionId` du graphe) | `metapopulation requires a mission text` |

Un jury ne vote jamais sans ballot ; une capacité symbiotique ne s'exécute
jamais sans exécuteur fourni par la mission. L'input mission traverse les
opérateurs jusqu'aux feuilles (pass-through quand le parent n'a pas produit
de sortie) ; à l'intérieur de `SEQUENCE`/`NEST`, une feuille reçoit la
sortie de l'étape/hôte précédent, pas l'input mission.

Le [contrat Holobionte](runtime-holobionte.md) détaille les preuves liées aux résultats, les budgets cumulés, les refus et le cycle de vie. La composition seule reste `COMPOSED`.

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

- Cette exécution des graphes morphologiques est distincte du préparateur de
  mission historique `morphogenesisRuntime`. Après mission, ce dernier ne fait
  qu'émettre une proposition; il n'applique pas le graphe ni ne crée de commit.
- Les contrôleurs sont des modèles in-process simplifiés, pas les runtimes
  lourds (sessions distribuées, CRDT réseau, jury humain).
- Le cycle Métapopulation sur région vide rend `NO_ACTION` avec
  `actionCount: 0`. Les actions d’extinction, recolonisation, migration, recherche
  ou évolution restent soumises à leurs preuves et adaptateurs ; voir le
  [contrat runtime](runtime-metapopulation.md).
- `MorphologyRuntime.changeVariant({ nodeId, graph, newVariant, execContext })`
  exige une transition enregistrée dans le `variantRegistry`, puis applique ses
  conditions et ses exigences de preuve avant le patch. Sans règle ou preuve,
  le changement est refusé. Le patch transmet les métadonnées de gain/coût,
  l'autorité et le lease; la vérification structurelle du graphe reste un gate
  distinct.

Chaque feuille du graphe porte maintenant un résultat distinct :
`executionStatus=completed` signifie que l'opérateur a fini; `contractStatus`
et `evidenceStatus` restent `not_assessed` à ce niveau; `missionOutcome` vaut
`unverified` sauf si le cycle déclare explicitement `actionCount: 0`, auquel cas
il vaut `no_action`. Un statut local de plugin tel que `VERIFIED` ne prouve pas
à lui seul la réussite de la mission. La Métapopulation vide retourne
`NO_ACTION`, jamais `VERIFIED`.

Les receipts émis par les opérateurs sont des traces d'exécution
(`recordType: execution_receipt`, `verificationStatus: not_verified`). Ils
restent dans `receipts` et ne sont pas copiés dans `evidence`; seul un élément
d'évidence distinct peut alimenter les gates de preuve. Le receipt ne porte pas
à lui seul de signature ou de provenance vérifiable.

La réussite technique de `MorphologyRuntime.execute` n'est plus enregistrée
automatiquement comme outcome de mission dans le magasin d'expérience. La
consolidation d'apprentissage relève des chemins séparés qui disposent d'un
outcome vérifié et de sa preuve.
