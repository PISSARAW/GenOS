# Topologies & Contrat de Capacités

Ce document décrit comment chaque **topologie d'orchestration** de GenOS est
câblée au runtime, quels **concepts** (capacités) elle exige, et comment ces
capacités deviennent **effectives** (leases d'outils, organisation).

## 1. Deux couches

- **Composition / topologie** : *qui* exécute et *comment* ils communiquent.
  - Modes : Trinity, A-Team, Biome, Biocénose, Holobionte, Syncytium, Rhizome, Métapopulation.
  - Organisations : les 19 topologies de `dynamicOrganizationService`.
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

| Topologie | Service de coordination | Concepts câblés |
| --- | --- | --- |
| **Trinity** | `trinityComparativeBarrier` + `trinityService` | dossiers réels → scoring par domaine (preuves réelles, pénalité dossiers vides, détection d'égalité) → fusion/escalade ; barrière comparative sur le chemin orchestrateur **et** direct (`merge_trinity` reconstruit depuis la télémétrie persistée). |
| **A-Team** | `aTeamCoordinationService` | domaines + handoffs `ligand` inter-étapes, contrat de capacités, arbitrage Pareto de l'intégration. |
| **Biocénose** | `biocenoseService` | évaluation communautaire : arène Pareto (`arenaTaskEvaluation`), diversité d'essaim (`swarmMetricsService`), organisation `brier_weighted_consensus`/`blind_adversarial_review`. |
| **Syncytium** | `syncytiumCoordinationService` | session CRDT partagée (`syncytiumCrdtService`), cytoplasme ionique (`syncytiumCytoplasmService`), verdict de cohérence (invariants + potentiel de membrane). |
| **Holobionte** | `holobionteCoordinationService` | hôte autorité + symbiotes en inférence **locale** (`symbioteRuntimeService.engineFor`), veto immunitaire de l'hôte (`chaperoneAgentOutput`/`evaluateCognitiveDrift`). |
| **Métapopulation** | `metapopulationCoordinationService` | quorum pondéré, plasticité des connexions, plan de régénération (lignage/mémoire/cryptobiose). |
| **Rhizome** | `rhizomeCoordinationService` | maille de capacités (`routeToCapability`), stigmergie (`swarmStigmergyVectorService`), cohérence Kuramoto. |
| **Biome** | `biomeCoordinationService` | allocation écologique des ressources, foraging optimal Charnov/Lévy (`foragingScoutHarvesterService`), santé d'écosystème (`swarmMetricsService`). |

Le point d'entrée unique est `biologicalTopologyService.composeMode({ db, orchestratorId, mode, mission })` : il route chaque mode vers son service, applique l'organisation recommandée et renvoie `members`, `organization`, `capabilityContract`, et le cas échéant `sessionId`.

## 4. Organisation & algorithmes d'essaim

- `dynamicOrganizationService.changeOrganization` renvoie désormais
  `capabilities` (capacités requises) et `runStep(state, options)`.
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
- `leaseForCapabilities(baseLease, capabilities)` élargit un lease de base sans
  jamais sortir de `KNOWN_TOOL_ALLOW_LIST` ni réintroduire `genos_orchestrate`.
- `orchestratorLeaseForPlan(plan)` intègre `plan.capabilityContract.required` ;
  `workerToolLeaseForCapabilities(role, capabilities)` fait de même côté worker.
- `agentAutonomyPlanService` renseigne `autonomyPlan.capabilityContract` à partir
  du mode actif et de l'organisation retenue.

## 6. Limites connues

- `COMPUTER_USE` et `OUTPUT_GOVERNOR` n'ont pas d'outil MCP dédié : pas de lease
  élargi tant qu'un outil `genos_computer_use` (ou équivalent) n'est pas enregistré.
- Les algorithmes d'essaim sont des fonctions pures : leur invocation à chaque
  tick par le supervisor n'est pas encore branchée.
- `swarmStigmergyVectorService` (Rhizome) et `swarmTopologyAlgorithms.slimeMouldNetwork`
  sont deux implémentations de stigmergie distinctes.
