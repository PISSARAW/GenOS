'use strict';

const assert = require('assert');
const registry = require('../src/services/ontogenesis/canonicalConceptRegistry');
const runtimeRegistry = require('../src/services/conceptRegistryService');
const accessMatrix = require('../src/services/capabilityAccessMatrix');

const health = registry.registryHealth();
assert.ok(health.domains >= 23);
assert.ok(health.concepts >= 180);
assert.ok(health.concepts >= 400);
assert.ok(health.capabilities > 0);

const web = registry.resolveMission({ objective: 'Créer un site React avec vérification et récupération',
  profile: { stack: ['react'] }, topology: 'a_team',
  requestedConcepts: ['morphogenese', 'genos_browser_act', 'core.self', 'concept_inexistant'] });
assert.ok(web.domains.includes('orchestration'));
assert.ok(web.domains.includes('epistemology'));
assert.ok(web.operational.length > 0);
assert.ok(web.unavailable.length > 0);
assert.strictEqual(web.coverage.inventory, 704);
assert.strictEqual(web.coverage.registryRuntime, 182);
assert.strictEqual(web.coverage.registryPhilosophy, 375);
assert.strictEqual(web.coverage.registryGraph, 527);
assert.strictEqual(web.coverage.runtime + web.coverage.operationalCapability + web.coverage.philosophyRead
  + web.coverage.capabilityGraph + web.coverage.workerRuntime + web.coverage.workerLifecycle
  + web.coverage.interfaceRuntime + web.coverage.centralChainRuntime + web.coverage.existingAdapter
  + web.coverage.documentationOnly, web.coverage.inventory);
assert.ok(web.canonicalConcepts.length >= 400);
assert.ok(web.canonicalConcepts.filter((concept) => concept.source === 'philosophy_registry').length >= 375);
assert.ok(web.runtimeConcepts.length >= 180);
assert.ok(web.runtimeConcepts.every((concept) => Array.isArray(concept.implementedPrimitives)));
assert.ok(web.runtimeConcepts.every((concept) => Array.isArray(concept.unavailablePrimitives)));
assert.ok(web.runtimeConcepts.every((concept) => concept.unavailablePrimitives.length === 0));
assert.ok(web.runtimeConcepts.filter((concept) => concept.primitives.length > 0)
  .every((concept) => concept.executable));
assert.deepStrictEqual(web.resolvedConcepts.map((concept) => concept.source), ['existing_adapter', 'runtime', 'philosophy', 'unknown']);
assert.strictEqual(web.resolvedConcepts[0].source, 'existing_adapter');
assert.strictEqual(web.resolvedConcepts[0].service, 'morphogenesisPlannerService');
assert.strictEqual(web.resolvedConcepts[0].executable, true);
assert.strictEqual(web.resolvedConcepts[1].executable, true);
assert.strictEqual(web.resolvedConcepts[2].access, 'read');
assert.strictEqual(web.resolvedConcepts[2].available, false);
assert.strictEqual(web.blockedConcepts.length, 2);
assert.deepStrictEqual(web.runtimeLeaseCandidates.map((entry) => entry.conceptId), ['genos_browser_act']);
assert.ok(web.runtimeLeaseCandidates.some((entry) => entry.tools.includes('genos_browser_act')));
assert.ok(web.runtimeLeaseCandidates.every((entry) => !entry.tools.includes('genos_orchestrate')));
const compatibleTools = new Set(runtimeRegistry.resolveCapabilities(web.compatibleRuntimeConcepts.map((concept) => concept.id)));
assert.ok(web.runtimeLeaseCandidates.every((entry) =>
  entry.tools.some((tool) => compatibleTools.has(tool))));
assert.strictEqual(web.strategy.id, 'minimal_patch');
assert.ok(web.compatibleRuntimeConcepts.length > 0);
assert.ok(web.selectedConcepts.some((concept) => concept.id === 'mission'));
assert.strictEqual(web.failClosed, true);

const graphMission = registry.resolveMission({ topology: 'syncytium', requestedConcepts: ['capability_routing'] });
assert.strictEqual(graphMission.resolvedConcepts[0].source, 'capability_graph');
assert.strictEqual(graphMission.resolvedConcepts[0].available, true);
assert.strictEqual(graphMission.resolvedConcepts[0].executable, true);

const lifecycleMission = registry.resolveMission({ topology: 'a_team', requestedConcepts: ['ontogenese', 'gvx', 'shev'] });
assert.deepStrictEqual(lifecycleMission.resolvedConcepts.map((concept) => concept.source),
  ['existing_adapter', 'existing_adapter', 'existing_adapter']);
assert.deepStrictEqual(lifecycleMission.resolvedConcepts.map((concept) => concept.available), [true, true, true]);
assert.strictEqual(lifecycleMission.resolvedConcepts[1].service, 'gvxDevelopmentController');
assert.strictEqual(lifecycleMission.resolvedConcepts[2].service, 'shev.responsibilityService');

const workerMission = registry.resolveMission({ topology: 'a_team', requestedConcepts: [
  'bounded_worker', 'verifier_worker', 'sub_orchestrator'
] });
assert.deepStrictEqual(workerMission.resolvedConcepts.map((concept) => concept.source),
  ['worker_runtime', 'worker_runtime', 'worker_runtime']);
assert.ok(workerMission.resolvedConcepts.every((concept) => concept.available && !concept.executable));
assert.ok(workerMission.resolvedConcepts.every((concept) => concept.access === 'contract'));
assert.ok(workerMission.canonicalConcepts.filter((concept) => concept.source === 'worker_runtime').length >= 19);

const workerLifecycleMission = registry.resolveMission({ topology: 'a_team', requestedConcepts: [
  'incarnation', 'selection_strategie', 'collecte_recus', 'terminer'
] });
assert.deepStrictEqual(workerLifecycleMission.resolvedConcepts.map((concept) => concept.source),
  ['worker_lifecycle', 'worker_lifecycle', 'worker_lifecycle', 'worker_lifecycle']);
assert.deepStrictEqual(workerLifecycleMission.resolvedConcepts.map((concept) => concept.service), [
  'agentIncarnationService', 'strategyExecutionAdapter', 'agentEvidenceService', 'agentProcessSupervisor'
]);
assert.ok(workerLifecycleMission.resolvedConcepts.every((concept) => concept.available && !concept.executable));
assert.ok(workerLifecycleMission.canonicalConcepts.filter((concept) => concept.source === 'worker_lifecycle').length >= 23);

const interfaceMission = registry.resolveMission({ topology: 'a_team', requestedConcepts: [
  'api_rest', 'mcp_stdio', 'cli_rust', 'health_checks'
] });
assert.deepStrictEqual(interfaceMission.resolvedConcepts.map((concept) => concept.source),
  ['interface_runtime', 'interface_runtime', 'interface_runtime', 'interface_runtime']);
assert.deepStrictEqual(interfaceMission.resolvedConcepts.map((concept) => concept.service), [
  'backendHttpServer', 'mcpStdioServer', 'genosCli', 'healthRoutes'
]);
assert.ok(interfaceMission.resolvedConcepts.every((concept) => concept.available && !concept.executable));
assert.ok(interfaceMission.canonicalConcepts.filter((concept) => concept.source === 'interface_runtime').length >= 24);

const chainMission = registry.resolveMission({ topology: 'a_team', requestedConcepts: [
  'differenciation', 'contrat', 'execution_isolee', 'action_bornee', 'transport_non_preuve'
] });
assert.deepStrictEqual(chainMission.resolvedConcepts.map((concept) => concept.source), [
  'central_chain_runtime', 'central_chain_runtime', 'central_chain_runtime',
  'central_chain_runtime', 'central_chain_runtime'
]);
assert.deepStrictEqual(chainMission.resolvedConcepts.map((concept) => concept.service), [
  'agentIncarnationService', 'workerContractEnforcement', 'vfsSandbox',
  'strategyExecutionAdapter', 'evidenceGate'
]);
assert.ok(chainMission.resolvedConcepts.every((concept) => concept.available && !concept.executable));

const topologyCapabilityMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'barriere_comparative', 'handoffs', 'quorum', 'veto_immunitaire', 'inference_locale',
  'etat_partage', 'crdt', 'allocation', 'demes', 'arbitrage_pareto', 'variants'
] });
assert.deepStrictEqual(topologyCapabilityMission.resolvedConcepts.map((concept) => concept.source),
  ['capability', 'capability', 'capability', 'capability', 'runtime',
    'capability', 'capability', 'capability', 'capability', 'capability', 'capability']);
assert.deepStrictEqual(topologyCapabilityMission.resolvedConcepts.map((concept) => concept.id), [
  'EVIDENCE_BARRIER', 'SIGNALING_BUS', 'QUORUM', 'IMMUNE_SYSTEM', 'local_inference',
  'CRDT_SHARED_STATE', 'CRDT_SHARED_STATE', 'TOKEN_ECONOMY', 'SWARM_METRICS',
  'STRATEGY_PORTFOLIO', 'STRATEGY_PORTFOLIO'
]);
assert.ok(topologyCapabilityMission.resolvedConcepts.every((concept) => concept.available === true || concept.available === false));

const dnaMission = registry.resolveMission({ topology: 'a_team', requestedConcepts: [
  'agent_dna', 'agent_genome', 'fingerprint', 'expression_adn_phenotype',
  'scellement_draft_sealed', 'graphe_organisme_procedural', 'immutabilite', 'provenance_genomique'
] });
assert.deepStrictEqual(dnaMission.resolvedConcepts.map((concept) => concept.source),
  ['capability', 'capability', 'runtime', 'capability', 'capability', 'capability', 'capability', 'runtime']);
assert.deepStrictEqual(dnaMission.resolvedConcepts.map((concept) => concept.id), [
  'GENOME_EPIGENETICS', 'GENOME_EPIGENETICS', 'provenance_integrity', 'GENOME_EPIGENETICS',
  'CAPSULES_SNAPSHOTS', 'PROCEDURAL_GUIDANCE', 'INVARIANT_GATES', 'provenance_integrity'
]);

const biologyMission = registry.resolveMission({ topology: 'biome', requestedConcepts: [
  'epigenetique', 'mutation', 'homeostasie', 'apoptose_controlee', 'reproduction',
  'replication', 'heredite', 'hote_symbionte', 'ecosysteme_agentique'
] });
assert.deepStrictEqual(biologyMission.resolvedConcepts.map((concept) => concept.source), [
  'capability', 'capability', 'capability', 'runtime', 'capability',
  'capability', 'capability', 'capability', 'capability'
]);
assert.deepStrictEqual(biologyMission.resolvedConcepts.map((concept) => concept.id), [
  'GENOME_EPIGENETICS', 'PROCEDURAL_EVOLUTION', 'CONSCIENCE_HOMEOSTASIS', 'apoptosis_concept',
  'EVOLUTION_REPRODUCTION', 'EVOLUTION_REPRODUCTION', 'GENOME_EPIGENETICS', 'IMMUNE_SYSTEM', 'SWARM_METRICS'
]);

const immuneMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'antigene_epistemique', 'selection_clonale', 'homeostasie_effort', 'apoptose_epistemique',
  'recus_aeis', 'assemblees_aeis', 'oracle_scelle', 'calibration_faux_positifs_negatifs',
  'rearbitrage_promotion'
] });
assert.deepStrictEqual(immuneMission.resolvedConcepts.map((concept) => concept.source), [
  'capability', 'capability', 'capability', 'runtime', 'capability',
  'capability', 'capability', 'capability', 'capability'
]);
assert.deepStrictEqual(immuneMission.resolvedConcepts.map((concept) => concept.id), [
  'IMMUNE_SYSTEM', 'IMMUNE_SYSTEM', 'CONSCIENCE_HOMEOSTASIS', 'apoptosis_concept',
  'EVIDENCE_BARRIER', 'QUORUM', 'CAPSULES_SNAPSHOTS', 'EPISTEMICS_BRIER', 'PROMOTION_GATE'
]);

const coordinationMission = registry.resolveMission({ topology: 'syncytium', requestedConcepts: [
  'intelligence_nuee', 'pheromones', 'signaux', 'recepteurs', 'ack', 'consensus',
  'flocking', 'competition', 'handoff', 'relations_inter_agents', 'graphe_relations',
  'responsabilite_persistante', 'observation_qualifiee', 'effet_verifie_projet'
] });
assert.ok(coordinationMission.resolvedConcepts.every((concept) => concept.source === 'capability'));
assert.deepStrictEqual(coordinationMission.resolvedConcepts.map((concept) => concept.id), [
  'SWARM_METRICS', 'STIGMERGY', 'SIGNALING_BUS', 'LIGAND_RECEPTOR', 'SIGNALING_BUS', 'QUORUM',
  'SWARM_METRICS', 'ARENA_COMPETITION', 'SIGNALING_BUS', 'LIGAND_RECEPTOR', 'GRAPH_MEMORY',
  'GOVERNANCE_APPROVAL', 'EVIDENCE_BARRIER', 'EVIDENCE_BARRIER'
]);

const coreFoundationsMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'runtime_agents_reproductible_supervise', 'etat_versionne',
  'branches_forks_snapshots_diffs_replay', 'succes_technique_vs_verite',
  'leases_outils', 'budgets', 'promotion_rejet_quarantaine_escalade', 'concept_metaphore_capacite'
] });
assert.deepStrictEqual(coreFoundationsMission.resolvedConcepts.map((concept) => concept.source), [
  'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'capability', 'runtime'
]);
assert.deepStrictEqual(coreFoundationsMission.resolvedConcepts.map((concept) => concept.id), [
  'paired_functional_reproducibility', 'provenance_integrity', 'deterministic_replay', 'evidence_first',
  'execution_guardrails', 'execution_guardrails', 'PROMOTION_GATE', 'evidence_first'
]);

const aliasMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: ['memoire_graphe', 'etat_causal', 'economie_tokens'] });
assert.deepStrictEqual(aliasMission.resolvedConcepts.map((concept) => concept.source), ['capability', 'capability', 'capability']);
assert.deepStrictEqual(aliasMission.resolvedConcepts.map((concept) => concept.id), ['GRAPH_MEMORY', 'CAUSAL_STATE', 'TOKEN_ECONOMY']);

const philosophyMission = registry.resolveMission({ requestedConcepts: ['ontologie_generale', 'causalite', 'platonisme'] });
assert.deepStrictEqual(philosophyMission.resolvedConcepts.map((concept) => concept.source), ['philosophy', 'philosophy', 'philosophy']);
assert.deepStrictEqual(philosophyMission.resolvedConcepts.map((concept) => concept.id),
  ['ontology.being', 'causality.determination', 'school.platonism']);
assert.ok(philosophyMission.resolvedConcepts.every((concept) => concept.access === 'read' && !concept.executable));
assert.ok(philosophyMission.coverage.philosophyRead >= 30);
assert.ok(philosophyMission.resolvedConcepts[0].implementationContract);
assert.equal(philosophyMission.resolvedConcepts[0].implementationContract.id, 'ontology.being');
const contractedPhilosophy = registry.resolveMission({ requestedConcepts: ['epistemologie'] });
assert.ok(contractedPhilosophy.resolvedConcepts[0].implementationContract);
assert.equal(contractedPhilosophy.resolvedConcepts[0].implementationContract.id, 'epistemology.knowledge');
assert.equal(contractedPhilosophy.coverage.implementationContracts, 375);
assert.ok(contractedPhilosophy.canonicalConcepts.some((concept) =>
  concept.implementationContract?.id === 'epistemology.knowledge'));

const canonicalCapabilityMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'portfolio_strategies', 'barriere_evidence', 'systeme_immunitaire', 'ligand_recepteur', 'observabilite'
] });
assert.deepStrictEqual(canonicalCapabilityMission.resolvedConcepts.map((concept) => concept.source),
  ['capability', 'capability', 'capability', 'capability', 'capability']);
assert.deepStrictEqual(canonicalCapabilityMission.resolvedConcepts.map((concept) => concept.id),
  ['STRATEGY_PORTFOLIO', 'EVIDENCE_BARRIER', 'IMMUNE_SYSTEM', 'LIGAND_RECEPTOR', 'OBSERVABILITY']);
assert.deepStrictEqual(canonicalCapabilityMission.resolvedConcepts.map((concept) => concept.available),
  [true, false, false, true, true]);
assert.strictEqual(canonicalCapabilityMission.blockedConcepts.length, 2);

const foundationsMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'preuve_avant_promotion', 'falsifiabilite', 'provenance', 'decisions_bornees', 'brier_score'
] });
assert.deepStrictEqual(foundationsMission.resolvedConcepts.map((concept) => concept.id),
  ['evidence_first', 'falsification_principle', 'provenance_integrity', 'execution_guardrails', 'EPISTEMICS_BRIER']);
assert.deepStrictEqual(foundationsMission.resolvedConcepts.map((concept) => concept.source),
  ['runtime', 'runtime', 'runtime', 'runtime', 'capability']);
assert.ok(foundationsMission.resolvedConcepts.slice(0, 4).every((concept) => concept.available));

const orchestrationMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'workflow', 'retry', 'checkpoint', 'rejeu_causal', 'bisection_causale', 'escalade'
] });
assert.deepStrictEqual(orchestrationMission.resolvedConcepts.map((concept) => concept.id), [
  'plan_execute_verify', 'circuit_breaker_concept', 'checkpoint_regeneration_concept',
  'deterministic_replay', 'causal_bisection', 'entropy_model_escalation_concept'
]);
assert.ok(orchestrationMission.resolvedConcepts.every((concept) => concept.source === 'runtime'));

const memoryMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'consolidation', 'oubli', 'stdp', 'apprentissage', 'reutilisation_resultats'
] });
assert.deepStrictEqual(memoryMission.resolvedConcepts.map((concept) => concept.id), [
  'memory_compilation_strategy', 'memory_sleep_cycle', 'stdp_plasticity',
  'controlled_lamarckian_learning', 'golden_path_replay'
]);
assert.ok(memoryMission.resolvedConcepts.every((concept) => concept.source === 'runtime'));

const resilienceMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'contrefactuel', 'dependance_causale', 'diagnostic', 'quarantaine',
  'autopsie_causale', 'sentinel', 'dead_letter', 'routage_local_distant'
] });
assert.deepStrictEqual(resilienceMission.resolvedConcepts.map((concept) => concept.id), [
  'n_way_counterfactual_fork', 'causal_replay_intervention_concept', 'diagnose_baseline',
  'immune_challenge', 'dlq_autopsy_concept', 'entropy_sentinel', 'dlq_autopsy_concept', 'MODEL_ROUTING'
]);
assert.deepStrictEqual(resilienceMission.resolvedConcepts.slice(0, 7).map((concept) => concept.source),
  ['runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime']);

const sensingMission = registry.resolveMission({ topology: 'biome', requestedConcepts: ['foveation', 'echolocation', 'olfaction'] });
assert.deepStrictEqual(sensingMission.resolvedConcepts.map((concept) => concept.source), ['runtime', 'runtime', 'runtime']);
assert.deepStrictEqual(sensingMission.resolvedConcepts.map((concept) => concept.id),
  ['foveal_scan_concept', 'echolocation_probe', 'scent_trace']);
assert.ok(sensingMission.resolvedConcepts.every((concept) => concept.available));
assert.ok(sensingMission.resolvedConcepts.every((concept) => concept.executable));

const sensorCapabilities = new Map(accessMatrix.fullMatrix()
  .filter((entry) => ['WEB_FORAGING', 'FOVEAL_PERCEPTION', 'COMPUTER_USE'].includes(entry.capability))
  .map((entry) => [entry.capability, entry]));
for (const capability of ['WEB_FORAGING', 'FOVEAL_PERCEPTION', 'COMPUTER_USE']) {
  assert.strictEqual(sensorCapabilities.get(capability).state, 'operationnel');
  assert.deepStrictEqual(sensorCapabilities.get(capability).missingFromCatalog, []);
  assert.deepStrictEqual(sensorCapabilities.get(capability).missingRoutes, []);
}

const sensorMission = registry.resolveMission({ topology: 'biome', requestedConcepts: ['web_foraging', 'perception_foveale'] });
assert.deepStrictEqual(sensorMission.resolvedConcepts.map((concept) => concept.source), ['capability', 'capability']);
assert.ok(sensorMission.runtimeLeaseCandidates.some((entry) => entry.tools.includes('genos_browser_act')));
assert.ok(sensorMission.runtimeLeaseCandidates.some((entry) => entry.tools.includes('genos_foveal_crop')));

console.log('ontogenesis canonical concept registry checks passed.');
