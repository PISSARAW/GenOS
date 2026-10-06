'use strict';

const assert = require('assert');
const registry = require('../src/services/ontogenesis/canonicalConceptRegistry');
const runtimeRegistry = require('../src/services/conceptRegistryService');

const groups = ['registry', 'foundations', 'adapters'];
const selected = process.argv[2] ? [process.argv[2]] : groups;
if (selected.some((name) => !groups.includes(name))) throw new Error('registry-scenario-inconnu');

if (selected.includes('registry')) {
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
  const graphKeys = Object.keys(require('../src/services/capabilityGraphService').getAllConcepts()).sort();
  assert.strictEqual(web.coverage.registryGraph, graphKeys.length);
  assert.deepStrictEqual(web.canonicalConcepts.filter((concept) => concept.source === 'capability_graph')
    .map((concept) => concept.graphKey).sort(), graphKeys);
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
}
if (selected.includes('foundations')) require('./helpers/ontogenesisConceptFoundations');
if (selected.includes('adapters')) require('./helpers/ontogenesisConceptAdapters');
console.log('ontogenesis canonical concept registry checks passed:', selected.join(', '));
