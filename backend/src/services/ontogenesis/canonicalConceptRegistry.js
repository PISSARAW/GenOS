'use strict';

/**
 * Registre de raccordement des familles canoniques à l'Ontogenèse.
 * Il décrit les points d'appel disponibles sans transformer un concept
 * documentaire en capacité exécutable.
 */

const accessMatrix = require('../capabilityAccessMatrix');
const { CONCEPT_DEFINITIONS } = require('../../philosophy/conceptDefinitions');
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

function requestedId(reference) {
  if (typeof reference === 'string') return reference;
  return reference && (reference.id || reference.name || reference.concept);
}

function runtimeReference(concept, reference) {
  const target = normalize(reference);
  return normalize(concept.id) === target || (concept.aliases || []).some((alias) => normalize(alias) === target);
}

function topologyTools(topology) {
  if (!topology) return null;
  const compatible = runtimeConceptRegistry.findCompatibleConcepts({ topology });
  const ids = [topology, ...compatible.map((concept) => concept.id)];
  return new Set(runtimeConceptRegistry.resolveCapabilities(ids));
}

function topologyAllows(topology, concept) {
  if (!topology) return true;
  if ((concept.compatibleTopologies || []).length) return concept.compatibleTopologies.includes(topology);
  const allowed = topologyTools(topology);
  return (concept.tools || []).some((tool) => allowed.has(tool));
}

function resolveConceptReference(reference, topology) {
  const requested = requestedId(reference);
  const target = normalize(requested);
  const runtime = Object.values(runtimeConceptRegistry.getAllConcepts())
    .find((concept) => runtimeReference(concept, requested));
  if (runtime) {
    const execution = executionFields(runtime);
    const compatible = topologyAllows(topology, runtime);
    return { requested, id: runtime.id, source: 'runtime', available: compatible,
      executable: execution.executable && compatible, reason: compatible ? null : 'topologie-incompatible',
      compatibleTopologies: runtime.compatibleTopologies, tools: runtime.tools || [],
      primitives: runtime.primitives || [], unavailablePrimitives: execution.unavailablePrimitives };
  }
  const capability = capabilityCatalog().find((entry) => normalize(entry.capability) === target);
  if (capability) return { requested, id: capability.capability, source: 'capability',
    available: capability.state === 'operationnel', executable: capability.state === 'operationnel',
    reason: capability.state === 'operationnel' ? null : `capacite-${capability.state}`, tools: capability.tools };
  const philosophical = CONCEPT_DEFINITIONS.find((concept) => normalize(concept.id) === target
    || (concept.aliases || []).some((alias) => normalize(alias) === target));
  if (philosophical) {
    const available = topologyAllows(topology, { tools: ['genos_philosophy'] });
    return { requested, id: philosophical.id, source: 'philosophy', available,
      executable: false, access: 'read', reason: available ? 'lecture-philosophique' : 'outil-lecture-non-autorise',
      tools: ['genos_philosophy'],
    status: philosophical.status, service: philosophical.service || null };
  }
  const documented = conceptInventory.entries().find((entry) => normalize(entry.id) === target);
  if (documented) return { requested, id: documented.id, source: 'documentation', available: false,
    executable: false, reason: 'concept-documentaire-sans-raccord-runtime', domain: documented.domain };
  return { requested, id: requested, source: 'unknown', available: false, executable: false, reason: 'concept-inconnu' };
}

function resolveConceptReferences(references, topology) {
  const list = Array.isArray(references) ? references : (references ? [references] : []);
  return list.map((reference) => resolveConceptReference(reference, topology));
}

function leaseCandidatesForReferences(references, topology) {
  const allowedTools = topologyTools(topology);
  return references.filter((concept) => concept.available && (concept.tools || []).length)
    .map((concept) => ({ conceptId: concept.id, tools: concept.tools.filter((tool) => tool !== 'genos_orchestrate'),
      authority: concept.access === 'read' ? ['read'] : ['execute'], maturity: concept.status || 'ready' }))
    .map((entry) => ({ ...entry, tools: allowedTools ? entry.tools.filter((tool) => allowedTools.has(tool)) : entry.tools }))
    .filter((entry) => entry.tools.length);
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
  const philosophical = CONCEPT_DEFINITIONS.map((concept) => ({
    id: concept.id, domain: concept.domain, state: concept.status || 'documented', executable: false,
    source: 'philosophy_registry', access: 'read', tools: ['genos_philosophy'],
    service: concept.service || null, mapping: concept.mapping || null
  }));
  const registered = Object.values(runtimeConceptRegistry.getAllConcepts()).map((concept) => ({
    ...executionFields(concept),
    id: concept.id, domain: concept.kind, state: concept.maturity || 'ready', source: 'concept_registry',
    tools: concept.tools || [], primitives: concept.primitives || [],
    capabilities: concept.capabilities || [], authority: concept.authorityRequirements || []
  }));
  return documented.concat(philosophical, registered);
}

function resolveMission(input = {}) {
  const objective = input.objective || '';
  const domains = domainMatches(`${objective} ${(input.profile && input.profile.stack || []).join(' ')}`);
  const capabilities = capabilityCatalog();
  const allowed = new Set(input.allowedCapabilities || []);
  const selectedDomains = new Set(domains);
  const selectedConcepts = conceptCatalog().filter((entry) => selectedDomains.has(entry.domain));
  const resolvedConcepts = resolveConceptReferences(input.requestedConcepts, input.topology);
  const hasRequestedConcepts = resolvedConcepts.length > 0;
  return {
    domains, capabilities,
    canonicalConcepts: conceptCatalog(), selectedConcepts,
    requestedConcepts: input.requestedConcepts || [], resolvedConcepts,
    blockedConcepts: resolvedConcepts.filter((concept) => !concept.available),
    runtimeConcepts: registeredConcepts(),
    compatibleRuntimeConcepts: compatibleRuntimeConcepts(input.topology),
    runtimeLeaseCandidates: hasRequestedConcepts
      ? leaseCandidatesForReferences(resolvedConcepts, input.topology) : runtimeLeaseCandidates(input.topology),
    strategy: strategyForMission(input.missionKind),
    operational: capabilities.filter((entry) => entry.state === 'operationnel' && (!allowed.size || allowed.has(entry.capability))),
    unavailable: capabilities.filter((entry) => entry.state !== 'operationnel'),
    failClosed: true
  };
}

function compatibleRuntimeConcepts(topology) {
  if (!topology) return [];
  const compatible = runtimeConceptRegistry.findCompatibleConcepts({ topology });
  const topologyConcept = runtimeConceptRegistry.getConcept(topology);
  const concepts = topologyConcept ? [topologyConcept, ...compatible.filter((concept) => concept.id !== topology)] : compatible;
  return concepts.map((concept) => ({
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
  const allowedTools = topologyTools(topology);
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
  runtimeLeaseCandidates, strategyForMission, resolveConceptReferences, resolveMission, registryHealth };
