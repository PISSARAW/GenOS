'use strict';

/**
 * @file capabilityGraphService.js
 * @description Single source of truth for all GenOS concepts. Aggregates
 * strategies, capabilities, tools, primitives and philosophy into a unified
 * queryable graph for discovery, routing and leasing.
 */

const { listStrategies } = require('../strategies/strategyRegistry');
const {
  GENOS_CAPABILITIES, MODE_CAPABILITIES, ORGANIZATION_CAPABILITIES
} = require('./topologyCapabilityService');
const { KNOWN_TOOL_ALLOW_LIST, CAPABILITY_TOOLS } = require('./toolLeasePolicy');
const { HANDLERS } = require('./primitiveHandlers/handlersRegistry');

const DEFAULT_META = {
  maturity: 'ready', strategies: [], primitives: [], tools: [],
  handlers: [], capabilities: [], compatible_topologies: [],
  compatible_roles: [], preconditions: [], effects: [],
  expected_evidence: [], uncertainty_reduction: 0.5,
  information_gain: 'medium', cost: 1, token_cost: 50,
  latency: 1, risk: 1, reversibility: 'high',
  required_authority: 'none', sandbox_requirements: [],
  dependencies: [], contraindications: [], fallback_concepts: [],
  learning_statistics: { usage: 0, success: 0, adaptation: 0 }
};

function graphEntry(partial) {
  const e = { ...DEFAULT_META, ...partial };
  e.learning_statistics = { ...DEFAULT_META.learning_statistics, ...(partial.learning_statistics || {}) };
  return e;
}

function findTopologiesForPrimitive(primitive) {
  const matches = [];
  const checkMap = (map) => {
    for (const [key, caps] of Object.entries(map)) {
      if (caps.some(cap => (CAPABILITY_TOOLS[cap] || []).some(t => t.includes(primitive)))) {
        matches.push(key);
      }
    }
  };
  checkMap(MODE_CAPABILITIES);
  checkMap(ORGANIZATION_CAPABILITIES);
  return [...new Set(matches)].sort();
}

function findCapsForStrategy(strategy) {
  const caps = [];
  for (const [cap, tools] of Object.entries(CAPABILITY_TOOLS)) {
    if (tools.some(t => strategy.primitives.some(p => t.includes(p)))) {
      caps.push(cap);
    }
  }
  return caps;
}

function findTopologiesForCapability(cap) {
  const topologies = [];
  const checkMap = (map) => {
    for (const [key, caps] of Object.entries(map)) {
      if (caps.includes(cap)) topologies.push(key);
    }
  };
  checkMap(MODE_CAPABILITIES);
  checkMap(ORGANIZATION_CAPABILITIES);
  return [...new Set(topologies)].sort();
}

function addStrategyConcepts(graph) {
  for (const s of listStrategies()) {
    graph[`strategy:${s.id}`] = graphEntry({
      id: s.id, aliases: [s.name], category: 'strategy',
      maturity: s.maturity, strategies: [s.id], primitives: s.primitives,
      handlers: s.primitives.filter(p => HANDLERS[p]),
      capabilities: findCapsForStrategy(s),
      compatible_topologies: findTopologiesForPrimitive(s.primitives[0]),
      compatible_roles: [s.role],
      preconditions: s.primitives.slice(0, 1),
      effects: [`resolve:${s.problemTypes[0]}`],
      expected_evidence: s.traits.includes('verification') ? ['artifact_hash'] : [],
      uncertainty_reduction: s.traits.includes('information_gain') ? 0.8 : 0.5,
      cost: s.costLevel, token_cost: s.costLevel * 100,
      latency: s.latencyLevel, risk: s.riskLevel,
      reversibility: s.traits.includes('safety') ? 'high' : 'medium',
      required_authority: s.maturity === 'ready' ? 'none' : 'review',
      sandbox_requirements: s.traits.includes('safety') ? ['vfs_dry_run'] : [],
      dependencies: s.primitives
    });
  }
}

function addCapabilityConcepts(graph) {
  for (const cap of GENOS_CAPABILITIES) {
    graph[`capability:${cap}`] = graphEntry({
      id: cap, aliases: [cap], category: 'capability',
      tools: CAPABILITY_TOOLS[cap] || [],
      capabilities: [cap],
      compatible_topologies: findTopologiesForCapability(cap),
      effects: [`enable:${cap}`]
    });
  }
}

function addToolConcepts(graph) {
  for (const tool of KNOWN_TOOL_ALLOW_LIST) {
    const caps = [];
    for (const [cap, tools] of Object.entries(CAPABILITY_TOOLS)) {
      if (tools.includes(tool)) caps.push(cap);
    }
    graph[`tool:${tool}`] = graphEntry({
      id: tool, aliases: [tool], category: 'tool',
      tools: [tool], capabilities: caps,
      effects: [`execute:${tool}`], dependencies: caps
    });
  }
}

function addPrimitiveConcepts(graph) {
  for (const p of Object.keys(HANDLERS)) {
    graph[`primitive:${p}`] = graphEntry({
      id: p, aliases: [p], category: 'procedural',
      primitives: [p], handlers: [p],
      compatible_topologies: findTopologiesForPrimitive(p),
      effects: [`primitive:${p}`]
    });
  }
}

function addPhilosophyConcepts(graph) {
  const entries = [
    ['evidence_first', 'Evidence First', ['gate:promotion_on_evidence'], { compatible_topologies: Object.keys(MODE_CAPABILITIES) }],
    ['epistemic_humility', 'Humilité épistémique', ['gate:uncertainty_disclosure'], { compatible_topologies: Object.keys(MODE_CAPABILITIES) }],
    ['falsification_principle', 'Principe de falsifiabilité', ['gate:hypothesis_falsifiable'], { compatible_topologies: Object.keys(MODE_CAPABILITIES) }],
    ['provenance_integrity', 'Intégrité de provenance', ['gate:lineage_tracked'], { compatible_topologies: Object.keys(MODE_CAPABILITIES) }],
    ['reversibility_maximum', 'Réversibilité maximale', ['gate:rollback_always_possible'], { compatible_topologies: Object.keys(MODE_CAPABILITIES) }]
  ];
  for (const [id, name, effects, extra] of entries) {
    graph[`philosophy:${id}`] = graphEntry({ id, aliases: [name], category: 'philosophy', effects, ...extra });
  }
}

function addSignalConcepts(graph) {
  const entries = [
    ['waggle_dance', 'Danse frétillante', ['signal:recruitment']],
    ['pheromone_trail', 'Piste phromonale', ['signal:stigmergy']],
    ['action_potential', "Potentiel d'action", ['signal:depolarization']],
    ['ligand_binding', 'Liaison ligand', ['signal:receptor_activation']],
    ['cytokine_storm', 'Tempête de cytokines', ['signal:immune_activation']],
    ['quorum_sensing', 'Quorum sensing', ['signal:density_dependent']]
  ];
  const extra = { capabilities: ['SIGNALING_BUS'], compatible_topologies: ['biome', 'rhizome', 'biocenose'] };
  for (const [id, name, effects] of entries) {
    graph[`signal:${id}`] = graphEntry({ id, aliases: [name], category: 'signal', effects, ...extra });
  }
}

function addStigmergyConcepts(graph) {
  const entries = [
    ['trace_deposit', 'Dépôt de trace', ['pheromone_deposit'], ['stigmergy:environment_marked']],
    ['trail_reinforcement', 'Renforcement de sentier', ['trail_selection'], ['stigmergy:path_strengthened']],
    ['evaporation', 'Évaporation', ['evaporation'], ['stigmergy:trace_decayed']],
    ['route_pruning', 'Élagage de route', ['route_pruning'], ['stigmergy:suboptimal_removed']]
  ];
  const base = { capabilities: ['STIGMERGY'], compatible_topologies: ['biome', 'rhizome'] };
  for (const [id, name, primitives, effects] of entries) {
    graph[`stigmergy:${id}`] = graphEntry({
      id, aliases: [name], category: 'stigmergy',
      primitives, handlers: primitives.filter(p => HANDLERS[p]),
      effects, ...base
    });
  }
}

function addSandboxConcepts(graph) {
  const entries = [
    ['vfs_sandbox', 'Bac à sable VFS', ['VFS_SANDBOX'], ['sandbox'], ['sandbox:isolated_fs']],
    ['dry_run', 'Simulation dry-run', [], ['vfs_dry_run'], ['sandbox:mutation_simulated']],
    ['permission_check', 'Vérification permissions', [], ['permission_check'], ['sandbox:access_validated']],
    ['blast_radius', 'Blast radius analysis', [], ['blast_radius'], ['sandbox:impact_bounded']]
  ];
  const base = { compatible_topologies: ['syncytium', 'holobionte'], sandbox_requirements: ['vfs_isolation'] };
  for (const [id, name, caps, primitives, effects] of entries) {
    graph[`sandbox:${id}`] = graphEntry({
      id, aliases: [name], category: 'sandbox',
      primitives, handlers: primitives.filter(p => HANDLERS[p]),
      capabilities: caps, effects, ...base
    });
  }
}

function addRoutingConcepts(graph) {
  const entries = [
    ['model_routing', 'Routage de modèle', ['MODEL_ROUTING'], ['slm_route'], ['routing:model_selected']],
    ['provider_fallback', 'Fallback fournisseur', [], ['provider_fallback'], ['routing:degraded_path']],
    ['capability_routing', 'Routage par capacité', [], ['capability_route'], ['routing:capability_matched']],
    ['inference_gateway', "Passerelle d'inférence", ['INFERENCE_GATEWAY'], [], ['routing:inference_dispatched']]
  ];
  const base = { compatible_topologies: ['holobionte', 'syncytium'] };
  for (const [id, name, caps, primitives, effects] of entries) {
    graph[`routing:${id}`] = graphEntry({
      id, aliases: [name], category: 'routing',
      primitives, handlers: primitives.filter(p => HANDLERS[p]),
      capabilities: caps, effects, ...base
    });
  }
}

function addInferenceConcepts(graph) {
  const entries = [
    ['local_inference', 'Inférence locale', ['LOCAL_INFERENCE'], [], ['inference:local_model']],
    ['frontier_escalation', 'Escalade frontier', [], ['frontier_escalation'], ['inference:stronger_model']],
    ['entropy_gating', 'Péage entropique', [], ['entropy_check'], ['inference:confidence_gate']],
    ['calibrated_quorum', 'Quorum calibré', [], ['brier_scores'], ['inference:weighted_aggregate']]
  ];
  const base = { compatible_topologies: ['holobionte', 'trinity', 'syncytium'], cost: 3, token_cost: 150, latency: 3, risk: 2 };
  for (const [id, name, caps, primitives, effects] of entries) {
    graph[`inference:${id}`] = graphEntry({
      id, aliases: [name], category: 'inference',
      primitives, handlers: primitives.filter(p => HANDLERS[p]),
      capabilities: caps, effects, ...base
    });
  }
}

function buildGraph() {
  const graph = {};
  addStrategyConcepts(graph);
  addCapabilityConcepts(graph);
  addToolConcepts(graph);
  addPrimitiveConcepts(graph);
  addPhilosophyConcepts(graph);
  addSignalConcepts(graph);
  addStigmergyConcepts(graph);
  addSandboxConcepts(graph);
  addRoutingConcepts(graph);
  addInferenceConcepts(graph);
  return Object.freeze(graph);
}

const CAPABILITY_GRAPH = buildGraph();

function getConcept(id) { return CAPABILITY_GRAPH[id] || null; }
function findConceptsByCategory(cat) {
  return Object.values(CAPABILITY_GRAPH).filter(c => c.category === cat);
}
function findCompatibleConcepts(topology) {
  return Object.values(CAPABILITY_GRAPH).filter(c => c.compatible_topologies.includes(topology));
}
function resolveCapabilities(ids) {
  return (ids || []).map(id => CAPABILITY_GRAPH[`capability:${id}`] || null).filter(Boolean);
}
function getAllConcepts() { return CAPABILITY_GRAPH; }
function findByMetadata(field, value) {
  return Object.values(CAPABILITY_GRAPH).filter(c => {
    const v = c[field];
    return Array.isArray(v) ? v.includes(value) : v === value;
  });
}

module.exports = {
  CAPABILITY_GRAPH, getConcept, findConceptsByCategory,
  findCompatibleConcepts, resolveCapabilities, getAllConcepts,
  findByMetadata, GENOS_CONCEPT_COUNT: Object.keys(CAPABILITY_GRAPH).length
};
