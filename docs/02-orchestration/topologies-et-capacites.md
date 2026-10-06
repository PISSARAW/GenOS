# Topologies & Contrat de Capacités

Ce document décrit comment chaque **topologie d'orchestration** de GenOS est
câblée au runtime, quels **concepts** (capacités) elle exige, et comment ces
capacités deviennent **effectives** (leases d'outils, organisation).

## 1. Deux couches

- **Composition / topologie** : *qui* exécute et *comment* ils communiquent.
  - Modes : Trinity, A-Team, Biome, Biocénose, Holobionte, Syncytium, Rhizome, Métapopulation.
  - Organisations dynamiques : les 19 organisations de `dynamicOrganizationService`.
- **Capacités / concepts** : *ce que* chaque agent sait faire (stratégie, preuve,
  mémoire, biomimétique, immunité, isolation, modèles, observabilité, perception).

Le **contrat de capacités** (`backend/src/services/topologyCapabilityService.js`)
est un registre déclaratif : pour chaque mode et chaque organisation, la liste des
capacités requises + un profil (preuve, mémoire, budget, communication, moteurs).

## 2. Capacités (menu)

`STRATEGY_PORTFOLIO`, `STRATEGY_ADAPTATION`, `ARENA_COMPETITION`, `PROMOTION_GATE`,
`TOKEN_ECONOMY`, `EVIDENCE_BARRIER`, `EPISTEMICS_BRIER`, `HALLUCINATION_MONITORING`,
`OUTPUT_GOVERNOR`, `PROVENANCE`, `GRAPH_MEMORY`, `VECTOR_MEMORY`, `EPISODIC_MEMORY`,
`SYNAPTIC_PLASTICITY`, `SIGNALING_BUS`, `LIGAND_RECEPTOR`, `STIGMERGY`, `SWARM_METRICS`,
`QUORUM`, `GENOME_EPIGENETICS`, `EVOLUTION_REPRODUCTION`, `IMMUNE_SYSTEM`,
`CONSCIENCE_HOMEOSTASIS`, `RESILIENCE_RECOVERY`, `CHAOS_ENGINEERING`, `CRDT_SHARED_STATE`,
`VFS_SANDBOX`, `CAPSULES_SNAPSHOTS`, `MODEL_ROUTING`, `LOCAL_INFERENCE`, `INFERENCE_GATEWAY`,
`OBSERVABILITY`, `GOVERNANCE_APPROVAL`, `COMPLIANCE`, `WEB_FORAGING`, `FOVEAL_PERCEPTION`,
`COMPUTER_USE`.

## 3. Câblage par topologie

| Topologie | Câblé dans le runtime | Contrat seulement / proposé |
| --- | --- | --- |
| **Trinity** | `dispatch_trinity` crée les mondes et `trinity-supervisor.cjs` attend leurs terminaisons, exécute les revues requises et applique les gates des douze variants. `merge_trinity` conserve la barrière comparative et les contrôles de promotion. | Les runners sont branchés depuis les corrections post-R3 ; les rapports R3 pré-correctifs ont produit 12 escalades et aucun merge, avec plusieurs runners non invoqués. Aucun run post-correctifs n'a encore qualifié la voie complète. Une assignation de modèle, une cellule ou un nom d'adapter ne remplace pas la provenance effective et les reçus de preuve. Voir [le contrat Trinity](topologies/trinity.md) et [ADR 0292](../adr/0292-execution-des-variants-trinity.md). |
| **A-Team** | Dispatch explicite et autoplanification partagent le run canonique et `executeTeamRun` : progression indépendante, preuves, critères globaux et accusés versionnés. | Conformité globale partielle. RCA/VEC de clôture mesurent achèvement et contributions, pas une garantie générale d’outils ou d’expertise. Évaluateurs de variantes distincts ; sous-runs multiteam génériques non branchés ([référence](../03-reference/runtime-a-team.md)). |
| **Biocénose** | `genos_biological_mode` → `biologicalTopologyService` → `biocenoseService.prepareCommunity`; évaluation communautaire et préparation d'organisation. | Les capacités du profil qui n'apparaissent pas dans ce chemin ne sont pas activées automatiquement. |
| **Syncytium** | `genos_biological_mode` crée une session persistée ; `genos_topology_session` expose snapshot et opérations CRDT, puis évaluation de cohérence. | Le contrat ne signifie pas que chaque mission utilise ce mode ou que toute mutation passe par un opérateur humain. |
| **Holobionte** | Le service commun `runHolobiontMission`, la CLI et Morphogenesis exécutent les capacités après admission, avec preuve indépendante, gate immunitaire, quotas, contribution/mémoire atomiques et clôture. Les sanctions de santé bornées sont intégrées au runtime. | La composition historique reste `COMPOSED`. Les adaptateurs fournissent l’isolation physique et les mesures ; aucun gain biologique ou longitudinal n’est certifié. Voir le [contrat](../03-reference/runtime-holobionte.md). |
| **Métapopulation** | `genos_biological_mode` compose les rôles ; `runAutonomousRegionalRuntime` applique les politiques, migrations, extinction et recolonisation avec relecture des preuves SQLite. | La composition ne démarre pas la boucle. Les appels sont bornés et exigent les adaptateurs externes requis ; voir le [contrat runtime](../03-reference/runtime-metapopulation.md). |
| **Rhizome** | Sessions persistées, routage multi-sauts borné, exécution et vérification indépendantes des sorties, croissance admise avec débit atomique, métriques de complétion et télémétrie du graphe réel. Les mutations ont une révision et un audit ; MCP expose les opérations explicites du service. | Le cycle de mission requiert des providers et vérificateurs réels enregistrés par l’hôte. La composition seule ne les lance pas. Les modèles biologiques illustratifs ne sont pas certifiés par le runtime. Voir le [contrat](../03-reference/runtime-rhizome.md). |
| **Biome** | `genos_biological_mode` crée et persiste la session ; `genos_topology_session` expose snapshot, allocation, foraging et santé, dont les résultats sont déposés dans la matrice biofilm. `biomeMissionLoop.runBiomeMission` enchaîne observe → propose → constrain → act → verify avec reçus, budget et autorisation explicite avant effet réel (`backend/tests/test_biome_mission_loop.js`, démo `examples/biome-mission-demo/run-demo.mjs`). | La navigation et la réallocation restent déclenchées par la mission, pas par une boucle autonome ; le mode simulé (`simulated: true`) ne produit aucun effet réel. |

Les parcours Trinity et A-Team ont leurs entrées d'orchestration dédiées. Pour les six modes biologiques, `genos_biological_mode` appelle `biologicalTopologyService.composeMode({ db, orchestratorId, mode, mission })`; les sessions Syncytium, Rhizome et Biome sont ensuite observables et opérables par `genos_topology_session`. La composition seule ne rend pas effectives les capacités simplement inscrites au contrat.

### 3.1 Matrice des types de workers

Il n'existe plus de correspondance unique topologie-rôle → `WorkerKind`. Les
huit topologies passent par `topologyWorkerKindService`, qui combine les
capacités obligatoires du rôle avec celles du `methodContract`, puis choisit
parmi les types qui satisfont toutes ces contraintes. Les préférences de
sélection servent à départager les candidats compatibles; elles ne peuvent
pas contourner une capacité manquante. Un type explicitement demandé est
contrôlé de la même façon et fait échouer la composition s'il est incompatible.

| Exigence de mission ou de rôle | Candidats préférés (si compatibles) |
| --- | --- |
| Observation (`observe`) | `scout_cell`, `resident_daemon` |
| Exécution bornée (`scoped_execution`) | `bounded_worker`, `specialist`, `procedural_executor` |
| Procédure déterministe (`deterministic_procedure`) | `procedural_executor` |
| Stratégie adaptative (`adaptive_strategy`) | `adaptive_worker` |
| Vérification (`verify`) | `verifier_worker`, `formal_worker` |
| Revue adversariale (`adversarial_review`) | `red_worker`, `forensic_worker` |
| Preuve formelle (`formal_proof`) | `formal_worker` |
| Expérimentation (`experiment`) | `experimental_worker` |
| Synthèse avec provenance (`synthesize`, `preserve_provenance`) | `synthesis_worker` |
| Coordination (`coordinate`) | `liaison_worker`, `sub_orchestrator` |
| Transfert (`handoff`) | `liaison_worker` |

Le rôle `host_orchestrator` demeure un orchestrateur sans `WorkerKind`; le
dispatcher ne le transforme pas en worker enfant et ne le compte pas dans les
slots disponibles. Pour Holobionte, il représente l'autorité du parent qui
reçoit les résultats des symbiotes. Les
méthodes connues ajoutent leurs capacités au contrat du rôle : par exemple,
`dynamic_programming` requiert `deterministic_procedure`, tandis que
`evolutionary_search` requiert `adaptive_strategy`. Une méthode personnalisée
doit déclarer ses `requiredCapabilities`; une méthode inconnue sans capacités
déclarées échoue fermée. Sans contrat de méthode explicite, l'affectation porte
`prompt_defined` et ne certifie pas qu'une méthode seulement mentionnée dans
le prompt a été reconnue.

Le plan expose pour chaque membre `role`, `workerKind`, `methodContract`,
capacités requises, candidats compatibles et motif de sélection. Les contrats
sont persistés puis reconstruits et contrôlés côté serveur. Les six modes
biologiques produisent les membres typés dans leur résultat ou leur session;
leur composition seule ne lance pas nécessairement les workers. Voir
[Types de workers](../03-reference/types-de-workers.md#141-types-de-workers-vs-rôles-de-mission)
et [ADR 0123](../adr/0123-separer-profil-worker-et-contrat-de-methode.md).

### 3.2 Garage Fabric : circulation transversale

La morphogenèse choisit les rôles, méthodes, topologies et contrats. Le
[Garage Fabric](topologies/garage-fabric.md) ordonne ensuite les exécutions :
admission, attente durable, priorités, dépendances vérifiées, préemption
consentie et reprise depuis une capsule de fichiers. Ses douze politiques
ne sont ni douze topologies supplémentaires, ni des capacités d'outils.

La file SQLite, les baux clôturés et les réservations transactionnelles
protègent les plafonds locaux et projet. Chaque départ revérifie l'autorité,
le contrat du worker et le circuit breaker. Aucun mode Garage n'accorde de
lease MCP, ne modifie un `WorkerKind` ou ne remplace une barrière d'évidence.
La fin exige la preuve typée du run courant ; la persistance de la file
n'implique pas une restauration transparente des processus. Voir aussi le
[runtime agentique](../01-concepts/runtime-agentique.md).

### Plan exécuté pour Rhizome et Biome

1. Exposer leurs sessions dans le catalogue MCP et le dispatch local (`genos_biological_mode`, `genos_topology_session`).
2. Persister les sessions Biome dans `topologySessionStore`, comme celles du Rhizome, et recharger l'état depuis le stockage avant chaque opération.
3. Exposer les opérations Rhizome de graphe, routage, preuves et croissance, ainsi que `mission_metrics`, `maintain`, `set_variant`, `prune_apply` et `admit_growth`. Biome expose `snapshot`, `allocate`, `forage`, `health` ; chaque opération Biome journalise son résultat dans la matrice biofilm versionnée.
4. Vérifier par tests de câblage et persistance que ces appels MCP aboutissent aux services correspondants.

Rhizome possède désormais une boucle de mission bornée : chaque besoin est exécuté et vérifié, ou fait l’objet d’une croissance admise puis d’une nouvelle tentative. Les callbacks de l’hôte assurent les effets réels et la libération des providers. Le câblage MCP reste une API d’opérations explicites ; il ne déclenche pas cette boucle par la seule composition. La boucle Biome reste déclenchée par sa mission.

## 4. Organisation & algorithmes d'essaim

- `dynamicOrganizationService.changeOrganization` renvoie désormais
  `capabilities` (capacités requises) et `runStep(state, options)`.
- Les 19 organisations dynamiques sont :
  `specialist_expert_committee`, `blind_adversarial_review`,
  `red_blue_coevolution`, `brier_weighted_consensus`,
  `quorum_with_abstention`, `stigmergy`, `flocking_boids`,
  `fish_school_search`, `slime_mould_network`, `grey_wolf_optimizer`,
  `mycelial_routing`, `dynamic_polyethism`, `energy_huddle`,
  `network_silence`, `strategy_arena`, `hierarchical_merge`,
  `competitive_arena`, `isolated_recovery`, `memory_compilation`.
- Les organisations d'essaim ne sont plus des métadonnées :
  `swarmTopologyAlgorithms.js` implémente `flockingBoids`, `fishSchoolSearch`,
  `slimeMouldNetwork` (physarum), `greyWolfOptimizer`, exposés via
  `runTopologyStep(organization, state, options)`.

## 5. Capacités effectives (leases d'outils)

`toolLeasePolicy` mappe chaque capacité vers des outils **connus** (fail-closed) :

- `CAPABILITY_TOOLS` : capacité → outils (ex. `SIGNALING_BUS` →
  `genos_worker_publish`/`inbox` ; `IMMUNE_SYSTEM` →
  `genos_security_coevolution`/`genos_parasitic_pressure` ; `WEB_FORAGING` →
  `genos_browser_act`/`genos_optimal_foraging` ; `FOVEAL_PERCEPTION` →
  `genos_foveal_crop`).
- Pour le Web, ces leases rendent les handlers appelables séparément. Elles ne
  constituent pas un contrôleur : `browser_act`, `foveal_crop` et
  `optimal_foraging` ne se transmettent ni observations ni actions. `COMPUTER_USE`
  route vers le contrôle du bureau, avec son propre plan et son propre état.
- `leaseForCapabilities(baseLease, capabilities)` élargit un lease de base sans
  jamais sortir de `KNOWN_TOOL_ALLOW_LIST` ni réintroduire `genos_orchestrate`.
- `orchestratorLeaseForPlan(plan)` intègre `plan.capabilityContract.required` ;
  `workerToolLeaseForCapabilities(role, capabilities)` fait de même côté worker.
- `agentAutonomyPlanService` renseigne `autonomyPlan.capabilityContract` à partir
  du mode actif et de l'organisation retenue.

## 6. Capacités effectives (suite)

- `genos_topology_session` (opérations de session, graphe, preuve, croissance et maintenance) est enregistré
  et mappé aux capacités `CRDT_SHARED_STATE`, `STIGMERGY`, `SIGNALING_BUS`,
  `LIGAND_RECEPTOR`.
- Les sessions Syncytium/Rhizome sont **persistées** dans `topology_sessions`
  (`topologySessionStore`) et réhydratables : partageables entre l'orchestrateur
  et les workers (processus distincts).

## 7. Actionneurs et boucle

- `swarmTopologyRuntimeService.applyStepForOrchestrator` applique le pas
  d'organisation à chaque décision orchestrateur (`orchestrationActionExecutor.execute`),
  mémorise les préférés (`preferredSurvivorsFor`) et `agentRoundService` les
  utilise comme survivants préférés pour les continuations.
- `preferredAgents` couvre les 19 organisations : 4 filtres d'essaim
  (dont `slime_mould_network` trié par conductivité) + repli générique
  (`spokes`, `competitors`, `roleGradient`, `allocations`, `pairs`, `route`).
- L'état runtime combine positions stables (`id:role`), fitness issue du
  statut + activité réelle de messages (`agent_organization_messages`), et
  transmet `options.limit` aux préférés. `orchestrationActionExecutor` utilise
  la boucle bornée (`applyStepsForOrchestrator`, 3 pas, arrêt sur convergence).
- Promotions : `trinityComparativeBarrier.promoteWinner` marque le monde gagnant
  `promoted` (événement `TRINITY_WINNER_PROMOTED`) sur les deux chemins.
- Preuve probabiliste : `biocenoseService.brierConsensus` (Brier pondéré) et
  `quorumWithAbstention`.

## 8. Organisations et autorité

- `organizationAlgorithms.runOrganizationStep` implémente les 15 organisations
  non-essaim ; `runTopologyStep` délègue vers lui lorsque l'organisation n'est
  pas l'un des quatre algorithmes d'essaim. `stigmergy` accepte `state.trails`
  en repli de matrice, `mycelial_routing` accepte `options.need`.
- Le routage est extrait dans `organizationRouting.js` et **applique l'autorité**
  (`assertRoutingAuthority`) : en organisation *ranked* (grey wolf), un follower
  ne peut pas adresser un autre follower (`ORGANIZATION_AUTHORITY_VIOLATION`) ;
  en organisation *adversarial_pair*, un worker doit désigner un destinataire
  explicite (`ADVERSARIAL_RECIPIENT_REQUIRED`). `AUTHORITY` couvre les 19
  organisations ; la parité Rust vit dans `genos-orchestrator/src/organization_step.rs`
  (`authority_for`, `follower_may_address`, `adversarial_needs_recipient`, `step_family`).

## 9. Ce qui reste ouvert

- Les algorithmes sont déterministes et locaux. Le consensus global est une
  agrégation en lecture seule (`organizationConsensusService`, ADR 0236) :
  snapshot par orchestrateur + résumé pondéré avec provenance, sans écriture
  ni décision contraignante. Le quorum/Brier/trails/populations sont dérivés
  des messages d'organisation réels (`vote`, `evidence`, `trace`) ; sans
  messages, le quorum ne conclut pas et le Brier reste sans vérité résolue.
  Les miroirs Rust (`organization_step.rs` : autorité, exécution essaim,
  résumé global) sont des briques pures, pas un runtime persistant.
- Aucune boucle haute fréquence autonome : `applyStepsForOrchestrator` est
  bornée (max 5 pas, arrêt sur convergence) et appelée par décision.
- Le foraging sans session navigateur est marqué `simulated` ; `computer_use`
  reste une session bureau distincte (séparation tracée dans le sensorium).
  GAIA : sans checkout externe, le test rend `SKIPPED` sans score.
- La perception/web reste au statut de primitives isolées. Le navigateur
  maintient une session locale et simule les actions de formulaire; la
  fovéation produit des ROI/manifests simulés, et le foraging renvoie un calcul
  sans commander la navigation. `computer_use` pilote séparément le bureau et
  n'est pas relié à cette session. Aucun flux ne chaîne actuellement capture,
  observation, décision, action et vérification sur un même état réel. Voir
  [Foraging web, fovéation et navigation active](../01-concepts/biomimetisme/web-foraging.md).
