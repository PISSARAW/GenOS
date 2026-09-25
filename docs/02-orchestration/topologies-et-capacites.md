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
| **Trinity** | Parcours dédié via `agentAutonomyPlanService`, `deploy/trinityDeploy.service` et `trinityComparativeBarrier` ; le chemin d'orchestration et `merge_trinity` appliquent la barrière comparative. | Les capacités listées par `topologyCapabilityService` ne sont pas toutes des leases ni des effets exécutés par chaque dossier. |
| **A-Team** | Parcours dédié via `agentAutonomyPlanService`, `aTeamDispatchService` et `aTeamCoordinationService` : domaines, handoffs et intégration. | Le contrat de capacités reste descriptif ; l'arbitrage Pareto n'est effectif que là où l'évaluateur A-Team l'appelle. |
| **Biocénose** | `genos_biological_mode` → `biologicalTopologyService` → `biocenoseService.prepareCommunity`; évaluation communautaire et préparation d'organisation. | Les capacités du profil qui n'apparaissent pas dans ce chemin ne sont pas activées automatiquement. |
| **Syncytium** | `genos_biological_mode` crée une session persistée ; `genos_topology_session` expose snapshot et opérations CRDT, puis évaluation de cohérence. | Le contrat ne signifie pas que chaque mission utilise ce mode ou que toute mutation passe par un opérateur humain. |
| **Holobionte** | `genos_biological_mode` compose hôte et symbiotes ; l'inférence locale est disponible via `symbioteRuntimeService.engineFor`. | `hostVeto`/`evaluateCognitiveDrift` sont des primitives, sans appel garanti dans le chemin de composition/déploiement. Immunité automatique : proposée. |
| **Métapopulation** | `genos_biological_mode` compose les membres ; quorum, pondération et régénération sont exposés par le service. | Ces calculs restent des appels explicites, pas une boucle autonome déclenchée par la composition. |
| **Rhizome** | `genos_biological_mode` crée et persiste la session ; `genos_topology_session` expose snapshot, dépôt stigmergique, sélection directe d'un membre par capacité et calcul slime sur arêtes fournies. Les mutations de session persistées reçoivent une révision et un événement d'audit. | `routeDirectMember` sélectionne parmi les membres composés, sans parcours multi-hop ; création automatique de branches et graphe de routes restent proposés. |
| **Biome** | `genos_biological_mode` crée et persiste la session ; `genos_topology_session` expose snapshot, allocation, foraging et santé, dont les résultats sont déposés dans la matrice biofilm. | Les étapes sont déclenchées explicitement : boucle fermée d'observation, navigation et réallocation automatique restent proposées. |

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

Le rôle `host_orchestrator` demeure un orchestrateur sans `WorkerKind`. Les
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

### Plan exécuté pour Rhizome et Biome

1. Exposer leurs sessions dans le catalogue MCP et le dispatch local (`genos_biological_mode`, `genos_topology_session`).
2. Persister les sessions Biome dans `topologySessionStore`, comme celles du Rhizome, et recharger l'état depuis le stockage avant chaque opération.
3. Donner à Rhizome les opérations `snapshot`, `deposit`, `route`, `slime`, et à Biome `snapshot`, `allocate`, `forage`, `health` ; chaque opération Biome journalise son résultat dans la matrice biofilm versionnée.
4. Vérifier par tests de câblage et persistance que ces appels MCP aboutissent aux services correspondants.

Le plan ci-dessus câble des opérations observables et explicitement appelées ; il n'implémente pas encore le routage de graphe automatique Rhizome ni une boucle autonome Biome.

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

- `genos_topology_session` (apply/snapshot/deposit/route/slime) est enregistré
  et mappé aux capacités `CRDT_SHARED_STATE`, `STIGMERGY`, `SIGNALING_BUS`,
  `LIGAND_RECEPTOR`.
- Les sessions Syncytium/Rhizome sont **persistées** dans `topology_sessions`
  (`topologySessionStore`) et réhydratables : partageables entre l'orchestrateur
  et les workers (processus distincts).

## 7. Actionneurs et boucle

- `swarmTopologyRuntimeService.applyStepForOrchestrator` applique le pas
  d'essaim à chaque décision orchestrateur (`orchestrationActionExecutor.execute`),
  mémorise les leaders (`preferredSurvivorsFor`) et `agentRoundService` les
  utilise comme survivants préférés pour les continuations.
- Promotions : `trinityComparativeBarrier.promoteWinner` marque le monde gagnant
  `promoted` (événement `TRINITY_WINNER_PROMOTED`) sur les deux chemins.
- Preuve probabiliste : `biocenoseService.brierConsensus` (Brier pondéré) et
  `quorumWithAbstention`.

## 8. Organisations et autorité

- `organizationAlgorithms.runOrganizationStep` implémente les 15 organisations
  non-essaim ; `runTopologyStep` délègue vers lui lorsque l'organisation n'est
  pas l'un des quatre algorithmes d'essaim.
- Le routage est extrait dans `organizationRouting.js` et **applique l'autorité**
  (`assertRoutingAuthority`) : en organisation *ranked* (grey wolf), un follower
  ne peut pas adresser un autre follower (`ORGANIZATION_AUTHORITY_VIOLATION`).

## 9. Ce qui reste ouvert

- Les algorithmes sont déterministes et locaux (pas de consensus distribué
  global) et le supervisor n'applique qu'une étape par décision, pas une boucle
  haute fréquence.
- La perception/web reste au statut de primitives isolées. Le navigateur
  maintient une session locale et simule les actions de formulaire; la
  fovéation produit des ROI/manifests simulés, et le foraging renvoie un calcul
  sans commander la navigation. `computer_use` pilote séparément le bureau et
  n'est pas relié à cette session. Aucun flux ne chaîne actuellement capture,
  observation, décision, action et vérification sur un même état réel. Voir
  [Foraging web, fovéation et navigation active](../01-concepts/biomimetisme/web-foraging.md).
