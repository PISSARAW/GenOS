const MODE_DEFINITIONS = {
  biome: {
    label: 'Biome',
    description: 'A broad operating environment containing several specialized agent populations.',
    roles: ['environment_mapper', 'resource_steward', 'population_specialist', 'ecosystem_observer'],
    hypotheses: [
      'Map the mission environment, constraints, interfaces, and available resources.',
      'Allocate resources across agent populations while preserving resilience and recovery paths.',
      'Own a specialized population and return local evidence plus dependencies on neighboring populations.',
      'Observe ecosystem-wide interactions, bottlenecks, and emergent risks.'
    ]
  },
  syncytium: {
    label: 'Syncytium',
    description: 'A tightly coupled collective sharing one continuously synchronized working state.',
    roles: ['shared_state_coordinator', 'parallel_executor', 'consistency_guardian', 'integration_executor'],
    hypotheses: [
      'Maintain the shared mission state and make coordination decisions visible to every agent.',
      'Execute a bounded slice in parallel while continuously publishing state changes.',
      'Detect conflicting assumptions, stale state, and invariant violations immediately.',
      'Integrate the collective result without allowing divergent local branches to survive unnoticed.'
    ]
  },
  holobionte: {
    label: 'Holobionte',
    description: 'An integrated host-and-symbiont collective combining complementary capabilities.',
    roles: ['host_orchestrator', 'specialist_symbiont', 'immune_symbiont', 'memory_symbiont'],
    hypotheses: [
      'Define the host objective, authority boundary, and contract shared by the collective.',
      'Supply specialized capability while preserving the host mission and reporting evidence.',
      'Challenge unsafe, unsupported, or contradictory outputs before they enter the host result.',
      'Consolidate durable lessons, lineage, and reusable context for the host.'
    ]
  },
  biocenose: {
    label: 'Biocenose',
    description: 'A community of autonomous agents coordinating through cooperation, competition, and validation.',
    roles: ['community_facilitator', 'independent_solver', 'adversarial_reviewer', 'consensus_observer'],
    hypotheses: [
      'Set the community protocol, evidence threshold, and decision boundaries without solving for the group.',
      'Develop an independent solution and publish evidence, assumptions, and unresolved tensions.',
      'Try to falsify competing proposals and expose collusion, blind spots, or weak evidence.',
      'Measure diversity, convergence, and consensus quality before recommending a collective result.'
    ]
  }
};

const MODE_PATTERNS = {
  biome: /\b(?:biome|biom[eé])\b/i,
  syncytium: /\b(?:syncytium|syncytium)\b/i,
  holobionte: /\b(?:holobionte|holobiont)\b/i,
  biocenose: /\b(?:bioc[ée]nose|biocenosis)\b/i
};

function definitionFor(mode) {
  const key = String(mode || '').trim().toLowerCase();
  const definition = MODE_DEFINITIONS[key];
  if (!definition) {
    throw Object.assign(new Error(`Unknown biological mode '${mode}'.`), { code: 'BIOLOGICAL_MODE_UNKNOWN' });
  }
  return { key, ...definition };
}

function analyzeMission(mode, mission) {
  const definition = definitionFor(mode);
  const text = String(mission || '');
  const explicitlyRequested = MODE_PATTERNS[definition.key].test(text);
  return {
    mode: definition.key,
    label: definition.label,
    description: definition.description,
    recommended: explicitlyRequested,
    explicitlyRequested,
    decision: explicitlyRequested ? 'launch' : 'not_applicable',
    members: definition.roles.map((role, index) => ({
      label: `${definition.key}_${index + 1}`,
      role,
      hypothesis: definition.hypotheses[index],
      modelTier: index === 0 || index === 2 ? 'frontier' : 'standard',
      mode: definition.key,
      pipelineStage: index === 0 ? 0 : 1
    }))
  };
}

function compose(mode, mission) {
  const definition = definitionFor(mode);
  const goal = String(mission || '').trim();
  if (!goal) throw Object.assign(new Error(`${definition.label} mission is required.`), { code: 'BIOLOGICAL_MISSION_REQUIRED' });
  return analyzeMission(definition.key, goal).members.map((member, index) => ({
    ...member,
    memberNumber: index + 1,
    mission: `${definition.label} shared mission: ${goal}\nCollective principle: ${definition.description}\nRole hypothesis: ${member.hypothesis}\nReturn evidence, state changes, and integration constraints to the orchestrator.`
  }));
}

function listModes() {
  return Object.keys(MODE_DEFINITIONS);
}

module.exports = { analyzeMission, compose, definitionFor, listModes };