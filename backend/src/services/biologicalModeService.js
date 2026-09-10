const symbioteRuntime = require('./symbioteRuntimeService');

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
  },
  rhizome: {
    label: 'Rhizome',
    description: 'A decentralized collective that grows new coordination points wherever capability is needed.',
    roles: ['rootless_coordinator', 'capability_offshoot', 'local_bridge', 'boundary_scout'],
    hypotheses: [
      'Coordinate the mission without becoming a permanent central authority.',
      'Grow a new local capability branch where the current network has a gap.',
      'Bridge neighboring branches and preserve evidence across changing routes.',
      'Scout for missing capabilities, bottlenecks, and opportunities to extend the network.'
    ]
  },
  metapopulation: {
    label: 'Metapopulation',
    description: 'Several semi-independent agent populations exchange signals, adapt their connections, and regenerate after local loss.',
    mechanisms: ['quorum_sensing', 'synaptic_plasticity', 'regeneration'],
    roles: ['population_isolator', 'quorum_sensor', 'synaptic_adaptor', 'regeneration_steward'],
    hypotheses: [
      'Partition the mission into semi-independent populations with explicit boundaries and exchange points.',
      'Activate coordination only when collective evidence or risk crosses a quorum threshold.',
      'Strengthen useful agent connections and weaken routes that repeatedly produce poor evidence.',
      'Reconstruct lost roles and working capacity from surviving state, memory, and lineage.'
    ]
  }
};

// Coordination/authority roles run on the frontier tier. Keying this off role
// identity (instead of declaration index) keeps the tier stable if a mode's
// role order ever changes.
const FRONTIER_ROLES = new Set([
  'environment_mapper', 'population_specialist',
  'shared_state_coordinator', 'consistency_guardian',
  'host_orchestrator', 'immune_symbiont',
  'community_facilitator', 'adversarial_reviewer',
  'rootless_coordinator', 'local_bridge',
  'population_isolator', 'synaptic_adaptor'
]);

function definitionFor(mode) {
  const key = String(mode || '').trim().toLowerCase();
  if (!MODE_DEFINITIONS[key]) throw Object.assign(new Error(`Unknown biological mode '${mode}'.`), { code: 'BIOLOGICAL_MODE_UNKNOWN' });
  return { key, ...MODE_DEFINITIONS[key] };
}

function compose(mode, mission) {
  const definition = definitionFor(mode);
  const goal = String(mission || '').trim();
  if (!goal) throw Object.assign(new Error(`${definition.label} mission is required.`), { code: 'BIOLOGICAL_MISSION_REQUIRED' });
  return definition.roles.map((role, index) => ({
    role,
    mechanisms: definition.mechanisms || [],
    modelTier: FRONTIER_ROLES.has(role) ? 'frontier' : 'standard',
    memberNumber: index + 1,
    // Holobionte Symbiotes run on a local inference runtime (see symbioteRuntimeService); other modes stay cloud.
    engine: symbioteRuntime.engineFor(role),
    mission: `${definition.label} shared mission: ${goal}\nCollective principle: ${definition.description}\nRole hypothesis: ${definition.hypotheses[index]}\nReturn evidence, state changes, and integration constraints to the orchestrator.`
  }));
}

module.exports = { compose };