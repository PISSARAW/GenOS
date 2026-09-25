const symbioteRuntime = require('./symbioteRuntimeService');

const RUNTIME_BRIDGE_CONTRACT = Object.freeze({
  controlPlane: 'backend-node',
  biomimeticKernel: 'crates/genos-orchestrator',
  integration: 'declared-contract',
  rustGuaranteesImported: false,
  evidenceRule: 'Rust biomimetic concepts do not count as Node runtime evidence unless a typed receipt or primitive journal entry records them.'
});

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
  'population_isolator', 'quorum_sensor', 'synaptic_adaptor', 'regeneration_steward'
]);

const RHIZOME_ROLE_TASKS = Object.freeze({
  rootless_coordinator: 'Construis une réponse à la mission à partir des objectifs, invariants et limites partagés. Réponds au besoin utilisateur, distingue les faits des hypothèses et définis les critères de preuve ainsi que les règles de transfert temporaire de coordination.',
  capability_offshoot: 'Cartographie les capacités évidentes, puis découvre les maillons nécessaires qui manquent. Pour chaque capacité, donne ses entrées, sorties, dépendances et contrat local. Identifie au moins une dépendance nécessaire absente de la carte initiale, ajoute-la à unknownDependencies comme hypothèse à vérifier et propose une branche distincte pour l’explorer.',
  local_bridge: 'Repère les contrats et données partagés entre capacités. Décris les interfaces compatibles, les transformations nécessaires, les preuves à conserver et les routes alternatives possibles.',
  boundary_scout: 'Explore les frontières, dépendances non cartographiées, goulets d’étranglement, hypothèses fragiles et routes de rechange. Identifie une dépendance indispensable absente de la carte initiale, inscris-la dans unknownDependencies comme hypothèse à vérifier et signale la branche d’exploration correspondante.'
});

function rhizomeMission(role, goal) {
  return `Mission Rhizome partagée : ${goal}\nRôle local : ${role}. ${RHIZOME_ROLE_TASKS[role]}\n\nRetourne uniquement un objet JSON valide sans bloc Markdown. Inclus un tableau top-level claims avec un statement utile et des références ou hypothèses explicitement étiquetées comme evidence. Ajoute les champs "answer":"réponse détaillée de cette branche", "capabilities":[{"id":"identifiant-kebab-case","label":"nom","description":"périmètre","inputs":["contrat ou donnée"],"outputs":["contrat ou donnée"],"dependsOn":["id de capacité"]}], "unknownDependencies":[{"id":"identifiant-kebab-case","label":"nom","reason":"pourquoi elle est nécessaire et ce qui reste inconnu"}], "interfaces":[{"from":"id","to":"id","relation":"BRIDGES","contract":"contrat partagé","data":["donnée"]}], "assumptions":["hypothèse non vérifiée"], "evidence":["référence ou observation"]. Signale au moins une dépendance nécessaire non décrite par la carte initiale dans unknownDependencies; présente-la comme une hypothèse à vérifier, jamais comme un fait établi. N’invente pas de preuves ni de dépendances confirmées. Respecte le type et le schéma d’artefact fournis par ton contrat de worker.`;
}

function definitionFor(mode) {
  const key = String(mode || '').trim().toLowerCase();
  if (!MODE_DEFINITIONS[key]) throw Object.assign(new Error(`Unknown biological mode '${mode}'.`), { code: 'BIOLOGICAL_MODE_UNKNOWN' });
  return { key, ...MODE_DEFINITIONS[key] };
}

function compose(mode, mission, options = {}) {
  const definition = definitionFor(mode);
  const goal = String(mission || '').trim();
  if (!goal) throw Object.assign(new Error(`${definition.label} mission is required.`), { code: 'BIOLOGICAL_MISSION_REQUIRED' });
  const roles = rolesForMission(mode, goal, definition);
  return roles.map((role, index) => {
    return composeMember({ mode, role, index, definition, goal, options });
  });
}

function composeMember({ mode, role, index, definition, goal, options }) {
  const requested = options.workerAssignments?.[role] || {};
  const methodContract = requested.methodContract;
  return {
    role,
    mechanisms: definition.mechanisms || [],
    modelTier: FRONTIER_ROLES.has(role) ? 'frontier' : 'standard',
    memberNumber: index + 1,
    ...(requested.workerKind ? { workerKind: requested.workerKind } : {}),
    ...(requested.workerRequirements ? { workerRequirements: requested.workerRequirements } : {}),
    ...(methodContract ? { methodContract } : {}),
    // Holobionte Symbiotes run on a local inference runtime (see symbioteRuntimeService); other modes stay cloud.
    engine: symbioteRuntime.engineFor(role),
    runtimeBridge: RUNTIME_BRIDGE_CONTRACT,
    mission: mode === 'metapopulation'
      ? metapopulationMission(goal, role, methodContract)
      : mode === 'rhizome'
        ? rhizomeMission(role, goal)
        : `${definition.label} shared mission: ${goal}\nCollective principle: ${definition.description}\nRole hypothesis: ${definition.hypotheses[index]}\nReturn evidence, state changes, and integration constraints to the orchestrator.`
  };
}

function rolesForMission(mode, goal, definition) {
  const limitedPopulation = mode === 'metapopulation'
    && /(?:three populations|three environments|trois populations|trois environnements)/i.test(goal);
  return limitedPopulation ? definition.roles.slice(0, 3) : definition.roles;
}

function metapopulationMission(goal, role, methodContract) {
  const assignment = methodContract?.methodId || 'method_unspecified';
  const details = methodContract ? `Method contract: ${JSON.stringify(methodContract)}.` : '';
  const securityScope = /(?:security|sécurité|threat modeling|analyse logique|adversarial thinking|vérification d.invariants)/i.test(goal)
    ? 'No concrete system behavior is supplied. State when findings cannot be validated, give an audit plan, and treat peer vulnerability claims as unverified hypotheses.' : '';
  const mandate = {
    population_isolator: 'Solve independently and report one result with evidence.',
    quorum_sensor: 'Assess whether supplied evidence meets the stated quorum; abstain when it does not.',
    synaptic_adaptor: 'Validate each supplied technique locally; recommend adoption only when measured fitness improves.',
    regeneration_steward: 'Reconstruct lost capacity from supplied surviving state and distinct lineages; verify viability.'
  }[role] || 'Return a bounded result with evidence.';
  return `Shared mission: ${goal}\nYour population role: ${role}. Assigned method: ${assignment}. ${mandate}\n${details}\n${securityScope}\nPut the complete answer in the first claim statement. Use only supplied facts and explicit assumptions. Never invent measurements or evidence. Keep this population’s answer separate from peers.`;
}

function runtimeBridgeContract() {
  return RUNTIME_BRIDGE_CONTRACT;
}

module.exports = { compose, runtimeBridgeContract };
