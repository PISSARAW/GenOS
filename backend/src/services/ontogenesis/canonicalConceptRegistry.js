'use strict';
// Raccord des familles canoniques : points d'appel disponibles, sans confondre concept documentaire et capacité exécutable.
const accessMatrix = require('../capabilityAccessMatrix');
const capabilityGraph = require('../capabilityGraphService');
const { CONCEPT_DEFINITIONS } = require('../../philosophy/conceptDefinitions');
const conceptInventory = require('./canonicalConceptInventory');
const runtimeConceptRegistry = require('../conceptRegistryService');
const workerKinds = require('../agents/workerKindService');
const implementationContracts = require('../implementationContractRouter');
const { referenceFor: implementationContractReference } = require('./philosophicalMissionContract');
const { resolveReference, graphExecutable, createLookup } = require('./canonicalReferenceResolver');
const { LIFECYCLE_REFERENCES,
  INTERFACE_REFERENCES, CENTRAL_CHAIN_REFERENCES } = require('./canonicalConceptAliases');
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
const EXISTING_ADAPTERS = Object.freeze({
  morphogenese: { service: 'morphogenesisPlannerService', access: 'plan' },
  ontogenese: { service: 'tickService', access: 'control' },
  gvx: { service: 'gvxDevelopmentController', access: 'observe' },
  shev: { service: 'shev.responsibilityService', access: 'observe' },
  maladies_auto_immunes: { service: 'immuneSurveillanceService', access: 'observe' },
  maladies_degeneratives: { service: 'clinicalStateService', access: 'observe' },
  maladies_infectieuses: { service: 'missionQuarantineGate', access: 'control' },
  maladies_genetiques: { service: 'clinicalStateService', access: 'observe' },
  cancers: { service: 'clinicalStateService', access: 'observe' },
  maladies_metaboliques: { service: 'clinicalStateService', access: 'observe' },
  maladies_cardiovasculaires: { service: 'clinicalStateService', access: 'observe' },
  maladies_psychiatriques: { service: 'clinicalStateService', access: 'observe' },
  maladies_environnementales: { service: 'clinicalStateService', access: 'observe' },
  maladie_nosocomiale: { service: 'missionQuarantineGate', access: 'control' },
  maladie_iatrogene: { service: 'clinicalStateService', access: 'observe' },
  therapie: { service: 'clinicalTherapyService', access: 'plan' },
  pharmacopee: { service: 'therapyAuthorizationService', access: 'plan' },
  global_workspace: { service: 'conceptRuntimeService', access: 'observe' },
  nonlinear_ignition: { service: 'conceptRuntimeService', access: 'observe' },
  sustained_recurrence: { service: 'conceptRuntimeService', access: 'observe' },
  metacognition: { service: 'conceptRuntimeService', access: 'observe' },
  predictive_inference: { service: 'conceptRuntimeService', access: 'observe' },
  self_world_distinction: { service: 'conceptRuntimeService', access: 'observe' },
  world_model: { service: 'conceptRuntimeService', access: 'observe' },
  flexible_agency: { service: 'conceptRuntimeService', access: 'observe' },
  causal_integration: { service: 'conceptRuntimeService', access: 'observe' },
  valence_interoception: { service: 'conceptRuntimeService', access: 'observe' },
  report_access: { service: 'conceptRuntimeService', access: 'observe' },
  equipe_specialisee: { service: 'variantExecutionRuntime.executeExpertCommittee', access: 'execute' },
  pipeline: { service: 'variantExecutionRuntime.executePipeline', access: 'execute' },
  project_dag: { service: 'variantExecutionRuntime.executeProjectDag', access: 'execute' },
  pod_cross_fonctionnel: { service: 'variantExecutionRuntime.executeCrossFunctionalPod', access: 'execute' },
  boundary_spanner: { service: 'variantExecutionRuntime.executeBoundarySpanner', access: 'execute' },
  equipe_matricielle: { service: 'variantExecutionRuntime.executeMatrixTeam', access: 'execute' },
  tiger_team: { service: 'variantExecutionRuntime.executeTigerTeam', access: 'execute' }
 });
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
function workerReference(requested, target) {
  const definition = workerKinds.KINDS[target];
  if (!definition) return null;
  const [family, artifact, authorityPhenotype] = definition;
  return { requested, id: target, source: 'worker_runtime', available: true, executable: false,
    access: 'contract', family, artifact, authorityPhenotype,
    capabilities: workerKinds.KIND_CAPABILITIES[target] || [] };
}
function lifecycleReference(requested, target) {
  const service = LIFECYCLE_REFERENCES[target];
  if (!service) return null;
  return { requested, id: target, source: 'worker_lifecycle', available: true, executable: false,
    access: 'contract', service, domain: 'worker_lifecycle' };
}
function interfaceReference(requested, target) {
  const service = INTERFACE_REFERENCES[target];
  if (!service) return null;
  return { requested, id: target, source: 'interface_runtime', available: true, executable: false,
    access: 'contract', service, domain: 'interfaces' };
}
function implementationContractFor(concept) {
  return implementationContracts.getImplementationContract(concept);
  }
function centralChainReference(requested, target) {
  const service = CENTRAL_CHAIN_REFERENCES[target];
  if (!service) return null;
  return { requested, id: target, source: 'central_chain_runtime', available: true, executable: false,
    access: 'contract', service, domain: 'central_chain' };
 }
function topologyTools(topology) {
  if (!topology) return null;
  const compatible = runtimeConceptRegistry.findCompatibleConcepts({ topology });
  const ids = [topology, ...compatible.map((concept) => concept.id)];
  return new Set(runtimeConceptRegistry.resolveCapabilities(ids));
 }
function topologyAllows(topology, concept) {
  if (!topology) return true;
  const compatibleTopologies = concept.compatibleTopologies || concept.compatible_topologies || [];
  if (compatibleTopologies.length) return compatibleTopologies.includes(topology);
  if (!(concept.tools || []).length && (concept.primitives || []).length) return true;
  const allowed = topologyTools(topology);
  return (concept.tools || []).some((tool) => allowed.has(tool));
 }
function resolveConceptReference(reference, topology, context) {
  return resolveReference({ reference, topology, ...context }, {
    normalize, requestedId, adapters: EXISTING_ADAPTERS, matches: runtimeReference,
    workerReference, lifecycleReference, interfaceReference, centralChainReference,
    executionFields, topologyAllows, getContract: implementationContractFor,
    referenceFor: implementationContractReference, capabilityCatalog
  });
}

function resolveConceptReferences(references, topology, capabilities = capabilityCatalog()) {
  const list = Array.isArray(references) ? references : (references ? [references] : []);
  const context = { capabilities, lookup: createLookup(normalize) };
  return list.map((reference) => resolveConceptReference(reference, topology, context));
}

function coverageReport(capabilities = capabilityCatalog()) {
  const runtime = Object.values(runtimeConceptRegistry.getAllConcepts());
  const graph = Object.values(capabilityGraph.getAllConcepts());
  const counts = { runtime: 0, operationalCapability: 0, philosophyRead: 0, capabilityGraph: 0,
    workerRuntime: 0, workerLifecycle: 0, interfaceRuntime: 0, centralChainRuntime: 0,
    existingAdapter: 0, documentationOnly: 0 };
  const context = { capabilities, lookup: createLookup(normalize) };
  for (const entry of conceptInventory.entries()) {
    const source = resolveConceptReference(entry.id, undefined, context).source;
    const category = { runtime: 'runtime', capability: 'operationalCapability', philosophy: 'philosophyRead',
      capability_graph: 'capabilityGraph', worker_runtime: 'workerRuntime', worker_lifecycle: 'workerLifecycle',
      interface_runtime: 'interfaceRuntime', central_chain_runtime: 'centralChainRuntime',
      existing_adapter: 'existingAdapter' }[source] || 'documentationOnly';
    counts[category] += 1;
  }
  return { inventory: conceptInventory.entries().length, ...counts,
    registryRuntime: runtime.length, registryPhilosophy: CONCEPT_DEFINITIONS.length, registryGraph: graph.length,
    implementationContracts: implementationContracts.implementationContractHealth(CONCEPT_DEFINITIONS).compiledConcepts };
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

function philosophicalCatalogEntry(concept) {
  const implementationContract = implementationContractFor(concept);
  return {
    implementationContract,
    id: concept.id, domain: concept.domain, state: concept.status || 'documented', executable: false,
    source: 'philosophy_registry', access: 'read', tools: ['genos_philosophy'],
    service: concept.service || null, mapping: concept.mapping || null,
    implementationContractReference: implementationContractReference(implementationContract)
  };
}

function conceptCatalog(capabilities = capabilityCatalog()) {
  const operational = new Set(capabilities.filter((entry) => entry.state === 'operationnel')
    .map((entry) => entry.capability.toLowerCase()));
  const documented = DOMAIN_CATALOG.flatMap((domain) => domain.concepts.map((id) => ({
    id, domain: domain.id, state: operational.has(id) ? 'operationnel' : 'catalogue',
    executable: operational.has(id), source: 'documentation'
  })));
  const philosophical = CONCEPT_DEFINITIONS.map(philosophicalCatalogEntry);
  const graph = Object.entries(capabilityGraph.getAllConcepts()).map(([graphKey, concept]) => ({
    id: concept.id, graphKey, domain: `capability_graph:${concept.category}`, state: concept.maturity || 'ready',
    executable: graphExecutable(concept),
    source: 'capability_graph', tools: concept.tools, primitives: concept.primitives,
    handlers: concept.handlers, capabilities: concept.capabilities,
    compatibleTopologies: concept.compatible_topologies
  }));
  const registered = Object.values(runtimeConceptRegistry.getAllConcepts()).map((concept) => ({
    ...executionFields(concept),
    id: concept.id, domain: concept.kind, state: concept.maturity || 'ready', source: 'concept_registry',
    tools: concept.tools || [], primitives: concept.primitives || [],
    capabilities: concept.capabilities || [], authority: concept.authorityRequirements || []
  }));
  const workers = Object.entries(workerKinds.KINDS).map(([id, definition]) => ({
    id, domain: 'workers', state: 'ready', executable: false, source: 'worker_runtime', access: 'contract',
    family: definition[0], artifact: definition[1], authorityPhenotype: definition[2],
    capabilities: workerKinds.KIND_CAPABILITIES[id] || []
  }));
  const lifecycle = Object.entries(LIFECYCLE_REFERENCES).map(([id, service]) => ({
    id, domain: 'worker_lifecycle', state: 'ready', executable: false, source: 'worker_lifecycle',
    access: 'contract', service
  }));
  const interfaces = Object.entries(INTERFACE_REFERENCES).map(([id, service]) => ({
    id, domain: 'interfaces', state: 'ready', executable: false, source: 'interface_runtime',
    access: 'contract', service
  }));
  const chain = Object.entries(CENTRAL_CHAIN_REFERENCES).map(([id, service]) => ({
    id, domain: 'central_chain', state: 'ready', executable: false, source: 'central_chain_runtime',
    access: 'contract', service
  }));
  return documented.concat(philosophical, graph, workers, lifecycle, interfaces, chain, registered);
}

function resolveMission(input = {}) {
  const objective = input.objective || '';
  const domains = domainMatches(`${objective} ${(input.profile && input.profile.stack || []).join(' ')}`);
  const capabilities = capabilityCatalog();
  const allowed = new Set(input.allowedCapabilities || []);
  const selectedDomains = new Set(domains);
  const canonicalConcepts = conceptCatalog(capabilities);
  const selectedConcepts = canonicalConcepts.filter((entry) => selectedDomains.has(entry.domain))
    .map((entry) => structuredClone(entry));
  const resolvedConcepts = resolveConceptReferences(input.requestedConcepts, input.topology, capabilities);
  const hasRequestedConcepts = resolvedConcepts.length > 0;
  return {
    domains, capabilities,
    canonicalConcepts, selectedConcepts,
    requestedConcepts: input.requestedConcepts || [], resolvedConcepts,
    blockedConcepts: resolvedConcepts.filter((concept) => !concept.available),
    runtimeConcepts: registeredConcepts(),
    compatibleRuntimeConcepts: compatibleRuntimeConcepts(input.topology),
    runtimeLeaseCandidates: hasRequestedConcepts
      ? leaseCandidatesForReferences(resolvedConcepts, input.topology) : runtimeLeaseCandidates(input.topology),
    strategy: strategyForMission(input.missionKind),
    operational: capabilities.filter((entry) => entry.state === 'operationnel' && (!allowed.size || allowed.has(entry.capability))),
    unavailable: capabilities.filter((entry) => entry.state !== 'operationnel'),
    coverage: coverageReport(capabilities),
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
  runtimeLeaseCandidates, strategyForMission, resolveConceptReferences, resolveMission, coverageReport, registryHealth };
