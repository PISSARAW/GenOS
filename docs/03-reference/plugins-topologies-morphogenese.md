# Plugins de topologies morphogénétiques

- **Statut** : Implémenté
- **Portée** : câblage des 8 topologies au `MorphologyRuntime` via `installTopologyPlugins`
- **Dernière revue** : 2026-10-15 (dispatch composite et continuation adaptative)

---

## 1. Contrat

`installTopologyPlugins(runtime)` enregistre une implémentation
`{ topology, run({ variant, workers }, context) }` par topologie, sans
auto-montage caché. Le `TopologyExecutor` préfère un exécuteur dédié, sinon
délègue au registre, sinon refuse (`Topology not registered`). Code :
`backend/src/services/morphogenesis/runtime/topologyPlugins.js`.

Dans le chemin principal d'une mission, `missionTopologyActivation` compose chaque
feuille topologique avant le dispatch. Après la barrière de preuve,
`missionMorphologyExecution` transmet au `MorphologyRuntime` le graphe courant et les
dossiers des workers. Une réévaluation effectuée à la frontière de continuation peut
avoir remplacé le graphe initial par une nouvelle version `COMPETE`, `FEDERATE` ou
`SEQUENCE`. Les workers restent associés à leurs feuilles par identifiant, jamais par
la seule position dans une liste.

Le contrôleur Syncytium de cette surface plugin possède son propre contrat.
Le [runtime Node Syncytium](runtime-syncytium.md) active les treize services de
variant dans le dispatch biologique et exige des preuves de clôture ; ces règles
ne doivent pas être déduites du seul résultat déterministe du contrôleur plugin.

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

### Workers Trinity et A-Team

Les contrôleurs Trinity et A-Team peuvent produire un aperçu local pour les
tests, mais ce résultat est explicitement `simulated_controller`, marqué
`simulationOnly: true` et `promotionEligible: false`. Il ne peut donc pas
alimenter une promotion ou une revendication vérifiée. Une mission qui doit
exécuter ces topologies en production doit fournir des workers avec reçu de
succès, artefact typé et références de provenance, puis activer
`executionPolicy.requireValidatedWorkers: true` (ou `environment: "production"`).
Sans ce contrat, le runtime refuse en fermé avec
`TOPOLOGY_VALIDATED_WORKER_REQUIRED`; un tableau de workers non validé ne
change jamais le mode en `worker_backed_controller`.

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
- Chemin de mission composite :
  `backend/tests/test_morphogenesis_main_path_activation.js` vérifie le dispatch mixte,
  les affectations par feuille et le refus sur budget insuffisant.
- Adaptation de continuation :
  `backend/tests/test_morphogenesis_dynamic_continuation.js` vérifie le choix de
  l'opérateur, la version du graphe, la réaffectation par identité, la politique de gel
  et l'entrée publique de configuration.
- Protocole à 8 avec SQLite :
  `docs/06-qualite-preuves/morphogenese-gates-2026-09-26.md`.
- Décision : `docs/adr/0133-graphe-morphologique-executable-et-plugins-topologies.md`.

## 6. Limites

- Le chemin de mission planifie et exécute désormais son graphe courant. Le parcours
  historique post-mission de `morphogenesisRuntime` reste distinct : il ne fait
  qu'émettre une proposition et ne crée pas de commit.
  L'appel public impose le mode `shadow` et émet
  `POST_MISSION_COMMIT_UNAVAILABLE`. Il refuse un résultat qui prétend être
  appliqué sans pont de production vers le noyau Rust, la gouvernance et la
  transition versionnée ([ADR 0407](../adr/0407-frontiere-post-mission-morphogenese.md)).
  Le préparateur valide et conserve désormais le couple topologie–variant
  demandé (`topologyId`/`variantId`) ou le choix local quand la topologie est
  connue. Cette identité est incluse dans la télémétrie de proposition ; elle
  ne constitue pas une preuve d'exécution du variant.
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
- Le `PatchExecutor` exige un committer versionné injecté avant de traiter un
  patch. Un graphe modifié seulement en mémoire ne peut plus être déclaré
  `committed`. Le profil multidimensionnel résolu est conservé dans
  `localProfile` de la feuille compilée.

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

## Portée du contrôleur A-Team et du backend

Le tableau des contrôleurs décrit le chemin plugin Morphogenèse ; il ne constitue pas une preuve de parité avec le parcours Node. Le backend explicite et autonome dispose d'un exécuteur canonique avec identités persistées, progression indépendante, preuves, critères globaux et accusés versionnés. Les tests SQLite/processus Node de ce parcours ne qualifient pas automatiquement le contrôleur Rust ni les topologies imbriquées. Voir [Référence du runtime A-Team](runtime-a-team.md).

## Décision Rust après mission

Le parcours public appelle désormais `genos morphogenesis-adjudicate` en
lecture seule après la proposition. Le noyau Rust planifie et vérifie la
gouvernance. Le graphe préparé est désormais persisté avant mission ; le
verdict `unverified` déclenche une proposition `spawn_verifier` du resolver
Rust, persistée avec le hash du graphe puis relue avant adjudication. Cette
proposition est refusée par la gouvernance en lecture seule. Les données
absentes ou périmées produisent `UNAVAILABLE`. Un autre verdict sans cause
épistémique qualifiée peut produire `NO_CHANGE`. Ce contrôle ne crée aucune
transition appliquée ni preuve de promotion ; voir [ADR 0412](../adr/0412-pont-rust-morphogenese-lecture-seule.md)
et [ADR 0416](../adr/0416-propositions-rust-liees-snapshot-morphologie.md).

Le refus Rust consultatif possède un reçu SQLite relisible, lié à la
proposition et au graphe. Le magasin de graphes refuse désormais tout
`commit` déclaré par des booléens, même si la version courante correspond.
Seuls les graphes `proposed` peuvent être enregistrés sans preuve de
transition ; voir [ADR 0418](../adr/0418-fermeture-commit-morphologie-et-recu-rust.md).

Le mode `commit` de `runMorphogenesisRuntime` (V2), même lorsqu'il est
implicite, refuse désormais avant tout appel d'adaptateur avec
`MORPHOGENESIS_PRODUCTION_AUTHORITY_UNAVAILABLE`. Une fonction injectée qui
déclare `kernel.valid`, `governance.allowed` ou `transition.committed` ne
constitue pas une autorité de production. Le mode `shadow` conserve
l'évaluation de la proposition sans application ; voir
[ADR 0423](../adr/0423-fermeture-mode-commit-v2-morphogenese.md).

Le moteur collectif historique `transitionEngineService` refuse aussi une
transition de production avant toute action : son snapshot en mémoire ne
restaure pas les effets sur les workspaces, les processus, les baux et les
budgets. `executeVersionedTransition` ne peut plus transformer un AgentGit
commit en preuve d'autorité. La réévaluation automatique distingue ce refus
d'un rollback qui aurait réellement compensé des effets ; voir
[ADR 0430](../adr/0430-fermeture-transition-collective-sans-snapshot-restaurable.md).

Les versions de graphe préparé et les propositions consultatives Rust sont
désormais append-only dans SQLite : `UPDATE` et `DELETE` sont refusés par des
triggers. Le reçu de décision peut donc relire ses deux sources sans mutation
ordinaire entre appels. Cette protection locale ne signe pas la décision et
le graphe préparé ne constitue toujours pas un snapshot restaurable ; voir
[ADR 0437](../adr/0437-immutabilite-sources-recu-morphogenese.md).

L'insertion d'un reçu de décision consultative et sa relecture de validation
s'exécutent dans une seule transaction SQLite. Si sa proposition ou son
graphe lié ne peut plus être relu, la transaction annule l'insertion : aucune
ligne orpheline append-only ne reste. Cette atomicité locale ne prouve pas
l'autorité de la décision et n'autorise pas APPLY ; voir
[ADR 0441](../adr/0441-atomicite-recu-consultatif-morphogenese.md).

La relecture du graphe préparé compare aussi la liste des workers du nœud
racine à celle de la morphologie soumise. Un rôle ou un membre modifié après
scellement donne `SNAPSHOT_STALE_OR_MISMATCHED` avant l'adjudication Rust.
Cette vérification lie une proposition de structure, sans prouver l'exécution
des workers ni rendre le graphe restaurable ; voir
[ADR 0463](../adr/0463-lier-workers-au-graphe-prepare-morphogenese.md).

La relecture exige aussi que l'identité interne du `graph_json` corresponde à
la ligne SQLite et à la référence : graphe, version, mission, statut,
parenté et date de création. La référence doit annoncer la même topologie et
le même variant que la morphologie soumise. Une divergence rend la décision
consultative indisponible avant le resolver Rust ; voir
[ADR 0467](../adr/0467-lier-identite-interne-graphe-prepare-morphogenese.md).
