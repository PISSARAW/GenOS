'use strict';

/**
 * Registre de raccordement des familles canoniques à l'Ontogenèse.
 * Il décrit les points d'appel disponibles sans transformer un concept
 * documentaire en capacité exécutable.
 */

const accessMatrix = require('../capabilityAccessMatrix');
const conceptInventory = require('./canonicalConceptInventory');
const runtimeConceptRegistry = require('../conceptRegistryService');

const LEGACY_DOMAIN_CATALOG = Object.freeze([
  ['foundations', ['mission', 'provenance', 'evidence', 'authority', 'lease', 'budget', 'workspace', 'promotion', 'recovery']],
  ['computational_biology', ['cell', 'organism', 'genome', 'phenotype', 'differentiation', 'morphogenesis', 'homeostasis', 'interoception', 'symbiosis', 'ecosystem']],
  ['agent_dna', ['agent_dna', 'agent_genome', 'epigenetics', 'mutation', 'speciation', 'graft', 'fossilization', 'heredity']],
  ['epistemology', ['claim', 'hypothesis', 'prediction', 'falsification', 'replication', 'grounding', 'uncertainty', 'promotion_gate']],
  ['cognition', ['attention', 'perception', 'interoception', 'imagination', 'reflection', 'metacognition', 'self_model', 'calibration']],
  ['memory_plasticity', ['working_memory', 'episodic_memory', 'semantic_memory', 'procedural_memory', 'ancestral_memory', 'retrieval', 'consolidation', 'plasticity']],
  ['collective_coordination', ['swarm', 'signal_plane', 'signal_bus', 'reception', 'ack', 'consensus', 'quorum', 'handoff', 'agow', 'shev']],
  ['research_creativity', ['creative_candidate', 'exploration', 'recombination', 'falsification', 'active_query', 'simulation', 'strategy_arena', 'research_pressure']],
  ['computation_physics', ['inertia', 'friction', 'entropy', 'threshold', 'pressure', 'cost', 'energy', 'blast_radius']],
  ['orchestration', ['orchestrator', 'mission', 'task', 'run', 'workflow', 'worker', 'fan_out', 'strategy', 'retry', 'checkpoint', 'rollback']],
  ['topologies', ['trinity', 'a_team', 'biocenose', 'holobionte', 'syncytium', 'biome', 'rhizome', 'metapopulation', 'garage_fabric']],
  ['dynamic_organizations', ['specialist_expert_committee', 'blind_adversarial_review', 'weighted_consensus', 'quorum_with_abstention', 'stigmergy', 'flocking', 'strategy_arena', 'competitive_arena', 'isolated_recovery']],
  ['topology_capabilities', ['strategy_portfolio', 'promotion_gate', 'evidence_barrier', 'brier', 'hallucination_monitoring', 'graph_memory', 'vector_memory', 'immune_system', 'crdt', 'sandbox', 'model_routing']],
  ['workers', ['scout_cell', 'resident_daemon', 'bounded_worker', 'adaptive_worker', 'specialist', 'procedural_executor', 'symbiotic_worker', 'verifier_worker', 'red_worker', 'experimental_worker', 'formal_worker', 'synthesis_worker', 'creative_worker', 'medical_worker', 'recovery_worker', 'forensic_worker', 'liaison_worker', 'teaching_worker', 'sub_orchestrator']],
  ['worker_lifecycle', ['incarnation', 'self_loading', 'mission_loading', 'authority_loading', 'memory_retrieval', 'recipe_selection', 'strategy_selection', 'receipts', 'review', 'termination']],
  ['biomimetic_sensing', ['foraging', 'foveation', 'active_perception', 'active_navigation', 'web_foraging', 'computer_use', 'sensorium']],
  ['epistemic_immune_system', ['antigen', 'innate_immunity', 'adaptive_immunity', 'clonal_selection', 'immune_memory', 'inflammation', 'quarantine', 'sealed_oracle', 're_arbitration']],
  ['nosology', ['runtime_pathology', 'drift', 'diagnosis', 'therapy', 'circuit_breaker', 'quarantine', 'repair', 'causal_autopsy']],
  ['possible_worlds', ['ontology', 'causality', 'counterfactual', 'world', 'accessibility', 'causal_dependence', 'replay', 'identity']],
  ['interfaces', ['rest', 'grpc', 'mcp', 'mcp_stdio', 'cli', 'ide', 'studio', 'sqlite_wal', 'event_log', 'observability']],
  ['security_governance', ['identity', 'rbac', 'tenant', 'project', 'release', 'deployment', 'human_approval', 'compliance', 'sandbox', 'secrets', 'cedar']],
  ['operations_resilience', ['daemon', 'autostart', 'sentinel', 'heartbeat', 'claim_recovery', 'retry_policy', 'dead_letter', 'wal_recovery', 'idempotence', 'rollout']],
  ['philosophy', ['ontology', 'causality', 'time', 'identity', 'mind', 'epistemology', 'ethics', 'phenomenology', 'process', 'possible_worlds']]
].map(([id, concepts]) => Object.freeze({ id, concepts: Object.freeze(concepts) })));

const DOMAIN_CATALOG = Object.freeze(conceptInventory.entries().reduce((domains, entry) => {
  const domain = domains.find((item) => item.id === entry.domain);
  if (domain) domain.concepts.push(entry.id);
  else domains.push({ id: entry.domain, concepts: [entry.id] });
  return domains;
}, LEGACY_DOMAIN_CATALOG.map((domain) => ({ id: domain.id, concepts: [...domain.concepts] }))
).map((domain) => Object.freeze({ id: domain.id, concepts: Object.freeze([...new Set(domain.concepts)]) })));

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function domainMatches(text) {
  const normalized = normalize(text);
  const baseline = new Set(['foundations', 'orchestration', 'epistemology', 'security_governance', 'operations_resilience']);
  DOMAIN_CATALOG.filter((domain) => domain.concepts.some((concept) => normalized.includes(concept)))
    .forEach((domain) => baseline.add(domain.id));
  return DOMAIN_CATALOG.map((domain) => domain.id).filter((id) => baseline.has(id));
}

function capabilityCatalog() {
  return accessMatrix.fullMatrix().map((entry) => ({
    capability: entry.capability, level: entry.level, state: entry.state,
    service: entry.service, tools: entry.catalogued
  }));
}

function executionFields(concept) {
  const primitives = concept.primitives || [];
  const handlers = require('../strategyExecutionAdapter').getHandlers();
  const implementedPrimitives = primitives.filter((primitive) => typeof handlers[primitive] === 'function');
  const unavailablePrimitives = primitives.filter((primitive) => typeof handlers[primitive] !== 'function');
  return {
    implementedPrimitives, unavailablePrimitives,
    executable: Boolean((concept.tools || []).length || (primitives.length && !unavailablePrimitives.length))
  };
}

function conceptCatalog() {
  const operational = new Set(capabilityCatalog().filter((entry) => entry.state === 'operationnel')
    .map((entry) => entry.capability.toLowerCase()));
  const documented = DOMAIN_CATALOG.flatMap((domain) => domain.concepts.map((id) => ({
    id, domain: domain.id, state: operational.has(id) ? 'operationnel' : 'catalogue',
    executable: operational.has(id), source: 'documentation'
  })));
  const registered = Object.values(runtimeConceptRegistry.getAllConcepts()).map((concept) => ({
    ...executionFields(concept),
    id: concept.id, domain: concept.kind, state: concept.maturity || 'ready', source: 'concept_registry',
    tools: concept.tools || [], primitives: concept.primitives || [],
    capabilities: concept.capabilities || [], authority: concept.authorityRequirements || []
  }));
  return documented.concat(registered);
}

function resolveMission(input = {}) {
  const objective = input.objective || '';
  const domains = domainMatches(`${objective} ${(input.profile && input.profile.stack || []).join(' ')}`);
  const capabilities = capabilityCatalog();
  const allowed = new Set(input.allowedCapabilities || []);
  const selectedDomains = new Set(domains);
  const selectedConcepts = conceptCatalog().filter((entry) => selectedDomains.has(entry.domain));
  return {
    domains, capabilities,
    canonicalConcepts: conceptCatalog(), selectedConcepts,
    runtimeConcepts: registeredConcepts(),
    compatibleRuntimeConcepts: compatibleRuntimeConcepts(input.topology),
    runtimeLeaseCandidates: runtimeLeaseCandidates(input.topology),
    strategy: strategyForMission(input.missionKind),
    operational: capabilities.filter((entry) => entry.state === 'operationnel' && (!allowed.size || allowed.has(entry.capability))),
    unavailable: capabilities.filter((entry) => entry.state !== 'operationnel'),
    failClosed: true
  };
}

function compatibleRuntimeConcepts(topology) {
  if (!topology) return [];
  return runtimeConceptRegistry.findCompatibleConcepts({ topology }).map((concept) => ({
    ...executionFields(concept),
    id: concept.id, kind: concept.kind, maturity: concept.maturity || 'ready',
    tools: concept.tools || [], primitives: concept.primitives || [],
    capabilities: concept.capabilities || [], strategies: concept.strategies || []
  }));
}

function registeredConcepts() {
  return Object.values(runtimeConceptRegistry.getAllConcepts()).map((concept) => ({
    ...executionFields(concept),
    id: concept.id, kind: concept.kind, maturity: concept.maturity || 'ready',
    tools: concept.tools || [], primitives: concept.primitives || [],
    capabilities: concept.capabilities || [], authority: concept.authorityRequirements || []
  }));
}

function runtimeLeaseCandidates(topology) {
  if (!topology) return [];
  const compatible = compatibleRuntimeConcepts(topology);
  const allowedTools = new Set(runtimeConceptRegistry.resolveCapabilities(compatible.map((concept) => concept.id)));
  return registeredConcepts().map((concept) => ({
    conceptId: concept.id,
    tools: runtimeConceptRegistry.generateLeaseForConcept(concept.id),
    authority: concept.authority,
    maturity: concept.maturity
  })).filter((entry) => entry.tools.some((tool) => allowedTools.has(tool)));
}

function strategyForMission(kind) {
  const ids = { implement: 'minimal_patch', repair: 'diagnose_baseline', verify: 'plan_execute_verify',
    explore: 'n_way_counterfactual_fork', decide: 'pareto_frontier_concept' };
  const executionIds = { decide: 'pareto_frontier' };
  const concept = runtimeConceptRegistry.getConcept(ids[kind] || ids.implement);
  if (!concept) return null;
  return { id: concept.id, strategyId: executionIds[kind] || concept.id,
    maturity: concept.maturity || 'ready', strategies: concept.strategies || [],
    primitives: concept.primitives || [], tools: concept.tools || [], costModel: concept.costModel,
    evidenceContract: concept.evidenceContract || [], compatibleTopologies: concept.compatibleTopologies || [] };
}

function registryHealth() {
  const capabilities = capabilityCatalog();
  return {
    domains: DOMAIN_CATALOG.length,
    concepts: DOMAIN_CATALOG.reduce((sum, domain) => sum + domain.concepts.length, 0),
    capabilities: capabilities.length,
    operational: capabilities.filter((entry) => entry.state === 'operationnel').length,
    partial: capabilities.filter((entry) => entry.state === 'partiel').length,
    conceptual: capabilities.filter((entry) => entry.state === 'conceptuel').length
  };
}

module.exports = { DOMAIN_CATALOG, capabilityCatalog, conceptCatalog, registeredConcepts,
  runtimeLeaseCandidates, strategyForMission, resolveMission, registryHealth };
