'use strict';

/**
 * Registre de raccordement des familles canoniques à l'Ontogenèse.
 * Il décrit les points d'appel disponibles sans transformer un concept
 * documentaire en capacité exécutable.
 */

const accessMatrix = require('../capabilityAccessMatrix');
const capabilityGraph = require('../capabilityGraphService');
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

const EXISTING_ADAPTERS = Object.freeze({
  morphogenese: { service: 'morphogenesisPlannerService', access: 'plan' },
  ontogenese: { service: 'tickService', access: 'control' },
  gvx: { service: 'gvxDevelopmentController', access: 'observe' },
  shev: { service: 'shev.responsibilityService', access: 'observe' }
});

const CAPABILITY_ALIASES = Object.freeze({
  portfolio_strategies: 'STRATEGY_PORTFOLIO', selection_multi_strategies: 'STRATEGY_PORTFOLIO',
  competition_arena: 'ARENA_COMPETITION', brier_score: 'EPISTEMICS_BRIER',
  barriere_evidence: 'EVIDENCE_BARRIER', ligand_recepteur: 'LIGAND_RECEPTOR',
  evidence_independante: 'EVIDENCE_BARRIER', foraging: 'WEB_FORAGING',
  routage_capacites: 'LIGAND_RECEPTOR', traces_stigmergiques: 'STIGMERGY',
  recovery_lignage: 'RESILIENCE_RECOVERY', stigmergie: 'STIGMERGY', systeme_immunitaire: 'IMMUNE_SYSTEM',
  capsules_snapshots: 'CAPSULES_SNAPSHOTS', observabilite: 'OBSERVABILITY',
  memoire_graphe: 'GRAPH_MEMORY', memoire_vectorielle: 'VECTOR_MEMORY',
  memoire_episodique: 'EPISODIC_MEMORY', memoire_procedurale: 'PROCEDURAL_MEMORY',
  economie_tokens: 'TOKEN_ECONOMY', etat_partage_crdt: 'CRDT_SHARED_STATE',
  bus_signalisation: 'SIGNALING_BUS', plasticite_synaptique: 'SYNAPTIC_PLASTICITY',
  etat_causal: 'CAUSAL_STATE', gates_invariants: 'INVARIANT_GATES',
  etat_partage_transactionnel: 'TRANSACTIONAL_SHARED_STATE', sync_selective: 'SELECTIVE_SYNC',
  resilience_recuperation: 'RESILIENCE_RECOVERY', homeostasie_conscience: 'CONSCIENCE_HOMEOSTASIS',
  evolution_reproduction: 'EVOLUTION_REPRODUCTION', genome_epigenetique: 'GENOME_EPIGENETICS',
  metriques_essaim: 'SWARM_METRICS', gate_promotion: 'PROMOTION_GATE', gouverneur_sortie: 'OUTPUT_GOVERNOR',
  sandbox_vfs: 'VFS_SANDBOX', gateway_inference: 'INFERENCE_GATEWAY', inference_locale: 'LOCAL_INFERENCE',
  guidance_procedurale: 'PROCEDURAL_GUIDANCE', evolution_procedurale: 'PROCEDURAL_EVOLUTION',
  validation_causale_procedurale: 'PROCEDURAL_CAUSAL_VALIDATION', conflits_semantiques: 'SEMANTIC_CONFLICTS',
  arene_competition: 'ARENA_COMPETITION', adaptation_strategie: 'STRATEGY_ADAPTATION',
  brier_epistemique: 'EPISTEMICS_BRIER', monitoring_hallucinations: 'HALLUCINATION_MONITORING',
  perception_foveale: 'FOVEAL_PERCEPTION', approbation_gouvernance: 'GOVERNANCE_APPROVAL',
  routage_modeles: 'MODEL_ROUTING'
});

// Les identifiants documentaires francophones pointent vers le registre
// philosophique deja implemente, sans transformer une lecture en execution.
const PHILOSOPHY_ALIASES = Object.freeze({
  ontologie_generale: 'ontology.being', causalite: 'causality.determination',
  temps_identite: 'ontology.identity-change', esprit_conscience: 'metaphysics.mind-body',
  epistemologie: 'epistemology.knowledge', philosophie_processus: 'process.actuality-potentiality',
  ethique: 'ethics.consequentialism', phenomenologie: 'metaphysics.reference-intentionality',
  platonisme: 'school.platonism', aristotelisme: 'school.aristotelianism',
  stoicisme: 'school.stoicism', epicurisme: 'school.epicureanism',
  scholastique: 'school.scholasticism', cartesianisme: 'school.cartesianism',
  leibnizianisme: 'school.leibnizianism', spinozisme: 'school.spinozism',
  newtonianisme: 'school.newtonianism', kantisme: 'school.kantianism',
  contingence_evenement: 'ontology.contingency-necessity', materialisme: 'metaphysics.material-monism',
  panpsychisme: 'metaphysics.panpsychism', eliminativisme: 'metaphysics.eliminativism',
  realisme_speculatif: 'school.speculative-realism', tout_vide_infini: 'ontology.whole-void-infinite',
  alterite: 'ontology.person-other', mondes_possibles: 'ontology.possible-worlds',
  realisme: 'truth.internal-realism', nominalisme: 'ontology.stances',
  conceptualisme: 'ontology.stances', organisme_procedural: 'process.actuality-potentiality'
});

const RUNTIME_ALIASES = Object.freeze({
  preuve_avant_promotion: 'evidence_first', falsifiabilite: 'falsification_principle',
  provenance: 'provenance_integrity', decisions_bornees: 'execution_guardrails',
  recus_verifiables: 'tool_output_validation', autorite_explicite: 'active_abstention_human_approval',
  isolation_workspaces: 'vfs_sandbox', fail_closed: 'zero_trust',
  execution_contrefactuelle: 'n_way_counterfactual_fork', falsification: 'falsifiable_hypothesis_tree',
  hypothese: 'falsifiable_hypothesis_tree', prediction: 'bayesian_sequential_diagnosis',
  compilation_memoire: 'memory_compilation_strategy', retrieval: 'retrieval_first',
  circuit_breaker: 'circuit_breaker_concept', regeneration: 'checkpoint_regeneration_concept',
  attention: 'foveal_scan_concept',
  foraging_charnov: 'energy_foraging_concept',
  foveation: 'foveal_scan_concept',
  perception_active: 'echolocation_probe',
  navigation_active: 'landmark_navigation',
  olfaction: 'scent_trace',
  echolocation: 'echolocation_probe'
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

function philosophyReference(target) {
  return PHILOSOPHY_ALIASES[target] || target;
}

function runtimeReferenceTarget(target) {
  return RUNTIME_ALIASES[target] || target;
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

function resolveConceptReference(reference, topology) {
  const requested = requestedId(reference);
  const target = normalize(requested);
  const adapter = EXISTING_ADAPTERS[target];
  if (adapter) return { requested, id: target, source: 'existing_adapter', available: Boolean(topology),
    executable: Boolean(topology), access: adapter.access,
    reason: topology ? null : 'topologie-requise', service: adapter.service };
  const runtimeTarget = runtimeReferenceTarget(target);
  const runtime = Object.values(runtimeConceptRegistry.getAllConcepts())
    .find((concept) => runtimeReference(concept, runtimeTarget));
  if (runtime) {
    const execution = executionFields(runtime);
    const compatible = topologyAllows(topology, runtime);
    return { requested, id: runtime.id, source: 'runtime', available: compatible,
      executable: execution.executable && compatible, reason: compatible ? null : 'topologie-incompatible',
      compatibleTopologies: runtime.compatibleTopologies, tools: runtime.tools || [],
      primitives: runtime.primitives || [], unavailablePrimitives: execution.unavailablePrimitives };
  }
  const capabilityId = CAPABILITY_ALIASES[target] || target;
  const capability = capabilityCatalog().find((entry) => entry.capability === capabilityId
    || normalize(entry.capability) === capabilityId.toLowerCase());
  if (capability) return { requested, id: capability.capability, source: 'capability',
    available: capability.state === 'operationnel', executable: capability.state === 'operationnel',
    reason: capability.state === 'operationnel' ? null : `capacite-${capability.state}`, tools: capability.tools };
  const philosophicalTarget = philosophyReference(target);
  const philosophical = CONCEPT_DEFINITIONS.find((concept) => normalize(concept.id) === normalize(philosophicalTarget)
    || (concept.aliases || []).some((alias) => normalize(alias) === normalize(philosophicalTarget)));
  if (philosophical) {
    const available = topologyAllows(topology, { tools: ['genos_philosophy'] });
    return { requested, id: philosophical.id, source: 'philosophy', available,
      executable: false, access: 'read', reason: available ? 'lecture-philosophique' : 'outil-lecture-non-autorise',
      tools: ['genos_philosophy'],
      status: philosophical.status, service: philosophical.service || null };
  }
  const graphConcept = Object.values(capabilityGraph.getAllConcepts()).find((concept) => normalize(concept.id) === target
    || (concept.aliases || []).some((alias) => normalize(alias) === target));
  if (graphConcept) {
    const available = topologyAllows(topology, { tools: graphConcept.tools, compatibleTopologies: graphConcept.compatible_topologies });
    const executable = Boolean(graphConcept.tools.length
      || (graphConcept.primitives.length && graphConcept.handlers.length === graphConcept.primitives.length));
    return { requested, id: graphConcept.id, source: 'capability_graph', available,
      executable: available && executable, reason: available ? null : 'topologie-incompatible',
      graphKey: Object.entries(capabilityGraph.getAllConcepts()).find(([, concept]) => concept === graphConcept)?.[0],
      tools: graphConcept.tools, primitives: graphConcept.primitives, handlers: graphConcept.handlers };
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

function coverageReport() {
  const runtime = Object.values(runtimeConceptRegistry.getAllConcepts());
  const graph = Object.values(capabilityGraph.getAllConcepts());
  const capabilities = new Set(capabilityCatalog().map((entry) => normalize(entry.capability)));
  const runtimeIds = new Set(runtime.flatMap((concept) => [concept.id, ...(concept.aliases || [])].map(normalize)));
  const graphIds = new Set(graph.flatMap((concept) => [concept.id, ...(concept.aliases || [])].map(normalize)));
  const philosophyIds = new Set(CONCEPT_DEFINITIONS.flatMap((concept) => [concept.id, ...(concept.aliases || [])].map(normalize)));
  const philosophyAliasIds = new Set([
    ...Object.keys(PHILOSOPHY_ALIASES), ...Object.values(PHILOSOPHY_ALIASES)
  ].map(normalize));
  const counts = { runtime: 0, operationalCapability: 0, philosophyRead: 0, capabilityGraph: 0,
    existingAdapter: 0, documentationOnly: 0 };
  for (const entry of conceptInventory.entries()) {
    const id = normalize(entry.id);
    const capabilityId = CAPABILITY_ALIASES[id];
    if (runtimeIds.has(id)) counts.runtime += 1;
    else if (capabilities.has(id) || (capabilityId && capabilities.has(normalize(capabilityId)))) counts.operationalCapability += 1;
    else if (philosophyIds.has(id) || philosophyAliasIds.has(id)) counts.philosophyRead += 1;
    else if (graphIds.has(id)) counts.capabilityGraph += 1;
    else if (EXISTING_ADAPTERS[id]) counts.existingAdapter += 1;
    else counts.documentationOnly += 1;
  }
  return { inventory: conceptInventory.entries().length, ...counts,
    registryRuntime: runtime.length, registryPhilosophy: CONCEPT_DEFINITIONS.length, registryGraph: graph.length };
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
  const graph = Object.entries(capabilityGraph.getAllConcepts()).map(([graphKey, concept]) => ({
    id: concept.id, graphKey, domain: `capability_graph:${concept.category}`, state: concept.maturity || 'ready',
    executable: Boolean(concept.tools.length || (concept.primitives.length && concept.handlers.length === concept.primitives.length)),
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
  return documented.concat(philosophical, graph, registered);
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
    coverage: coverageReport(),
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
