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
  'population_isolator', 'synaptic_adaptor'
]);

const RHIZOME_ROLE_TASKS = Object.freeze({
  rootless_coordinator: 'Construis une réponse à la mission à partir des objectifs, invariants et limites partagés. Réponds au besoin utilisateur, distingue les faits des hypothèses et définis les critères de preuve ainsi que les règles de transfert temporaire de coordination.',
  capability_offshoot: 'Cartographie les capacités évidentes, puis découvre les maillons nécessaires qui manquent. Pour chaque capacité, donne ses entrées, sorties, dépendances et contrat local. Propose une branche distincte pour chaque dépendance inconnue.',
  local_bridge: 'Repère les contrats et données partagés entre capacités. Décris les interfaces compatibles, les transformations nécessaires, les preuves à conserver et les routes alternatives possibles.',
  boundary_scout: 'Explore les frontières, dépendances non cartographiées, goulets d’étranglement, hypothèses fragiles et routes de rechange. Signale explicitement les branches qui méritent une exploration indépendante.'
});

const POPULATION_STRATEGIES = Object.freeze([
  ['gloutonne', /\b(?:greedy|gloutonn\w*)\b/i], ['programmation dynamique', /\b(?:dynamic programming|programmation dynamique|dp)\b/i],
  ['recherche locale', /\b(?:local search|recherche locale)\b/i], ['recherche évolutionnaire', /\b(?:evolutionary|évolutionnaire|evolutionary search)\b/i],
  ['programmation par contraintes', /\b(?:constraint programming|programmation par contraintes|\bcp\b)\b/i],
  ['navigateur desktop', /\b(?:desktop browser|navigateur desktop|browser desktop)\b/i], ['mobile à faible réseau', /\b(?:low.network mobile|mobile à faible réseau)\b/i],
  ['terminal limité', /\b(?:limited terminal|terminal très limité|terminal limité)\b/i], ['performance', /\bperformance\b/i],
  ['lisibilité', /\b(?:readability|lisibilité)\b/i], ['tolérance aux entrées invalides', /\b(?:invalid input|entrées invalides)\b/i],
  ['faible mémoire', /\b(?:low memory|faible mémoire)\b/i], ['threat modeling', /\b(?:threat modeling|modélisation des menaces)\b/i],
  ['analyse logique', /\b(?:logical analysis|analyse logique)\b/i], ['raisonnement adversarial', /\b(?:adversarial thinking|raisonnement adversarial)\b/i],
  ['vérification d’invariants', /\b(?:invariant verification|vérification d.invariants)\b/i]
]);

function rhizomeMission(role, goal) {
  return `Mission Rhizome partagée : ${goal}\nRôle local : ${role}. ${RHIZOME_ROLE_TASKS[role]}\n\nRetourne uniquement un objet JSON valide, sans bloc Markdown, qui respecte ce contrat de worker : inclue claims=[{"statement":"résumé de la réponse","evidence":["énoncé de mission et hypothèses explicites"]}] et workerArtifact={"type":"dossier","content":{"claims":[{"statement":"même résumé","evidence":["énoncé de mission et hypothèses explicites"]}]},"provenance":{"sourceRefs":["mission utilisateur"]}}. Ajoute aussi les champs "answer":"réponse détaillée de cette branche", "capabilities":[{"id":"identifiant-kebab-case","label":"nom","description":"périmètre","inputs":["contrat ou donnée"],"outputs":["contrat ou donnée"],"dependsOn":["id de capacité"]}], "unknownDependencies":[{"id":"identifiant-kebab-case","label":"nom","reason":"pourquoi elle est nécessaire"}], "interfaces":[{"from":"id","to":"id","relation":"BRIDGES","contract":"contrat partagé","data":["donnée"]}], "assumptions":["hypothèse non vérifiée"], "evidence":["référence ou observation"]. N’invente pas de preuves ni de dépendances confirmées; marque les déductions comme hypothèses. Les capacités et liens proposés restent à découvrir tant qu’ils ne sont pas vérifiés.`;
}

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
    ...(mode === 'metapopulation' ? { workerKind: metapopulationWorkerKind(role) } : {}),
    // Holobionte Symbiotes run on a local inference runtime (see symbioteRuntimeService); other modes stay cloud.
    engine: symbioteRuntime.engineFor(role),
    runtimeBridge: RUNTIME_BRIDGE_CONTRACT,
    mission: mode === 'metapopulation'
      ? metapopulationMission(goal, role, index)
      : mode === 'rhizome'
        ? rhizomeMission(role, goal)
        : `${definition.label} shared mission: ${goal}\nCollective principle: ${definition.description}\nRole hypothesis: ${definition.hypotheses[index]}\nReturn evidence, state changes, and integration constraints to the orchestrator.`
  }));
}

function metapopulationWorkerKind(role) {
  return {
    population_isolator: 'bounded_worker', quorum_sensor: 'scout_cell',
    synaptic_adaptor: 'adaptive_worker', regeneration_steward: 'recovery_worker'
  }[role];
}

function metapopulationMission(goal, role, index) {
  const assignment = assignedPopulationMethod(goal, index);
  const methods = [
    `Use exactly this local method: ${assignment}. Do not substitute or blend methods. Return the method name and a concrete result.`,
    `Use exactly this local method: ${assignment}. Do not repeat another population's method. Return the method name, calculations/findings, and concrete result.`,
    `Use exactly this local method: ${assignment}. Evaluate imported techniques only as candidates; validate them against your own constraints and fitness, adopt only a proven local improvement, and explain rejections. Never copy a complete solution.`,
    `Use exactly this local method: ${assignment}. Track local fitness and lineage; preserve multiple viable approaches. If collapse is specified, identify it, recolonize using founders from at least two lineages, and verify viability and non-clonality.`
  ];
  return `Metapopulation mission (all populations address the same problem): ${goal}\nPopulation ${index + 1}: ${role}. Assigned method: ${assignment}. Local mandate: ${methods[index]}\nKeep populations independent while publishing transferable techniques and counterexamples with supporting calculations or evidence. The receiver must validate imports locally; local constraints and fitness remain authoritative. Return a substantive result, method, evidence/calculations, fitness assessment, accepted/rejected migrations, and unresolved risks. Do not claim a result that contradicts your calculations.`;
}

function assignedPopulationMethod(goal, index) {
  const found = POPULATION_STRATEGIES.map(([label, pattern]) => ({ label, position: goal.search(pattern) }))
    .filter((item) => item.position >= 0).sort((left, right) => left.position - right.position);
  return found[index]?.label || ['recherche gloutonne', 'programmation dynamique', 'recherche locale', 'recherche évolutionnaire'][index];
}

function runtimeBridgeContract() {
  return RUNTIME_BRIDGE_CONTRACT;
}

module.exports = { compose, runtimeBridgeContract };
