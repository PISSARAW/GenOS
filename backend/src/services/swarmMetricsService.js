const {
  actionKey,
  computeEntropyStats,
  buildTransitionMaps,
  computeConditionalEntropy,
  detectPeriodicCycle,
  buildSparkline,
  classifyDrift,
  emptyEntropyResult,
  collectMessageGraph,
  findChattyLoops,
  findCircularDeadlocks,
  agentIdPair,
  buildTopologyNodes,
  makeEdgeAdder,
  addLineageAndPeerEdges,
  collectTelemetryEdges
} = require('./swarmMetricsHelpers');

function getTransitionEntropy(actionEvents = []) {
  const items = actionEvents.map(actionKey);
  if (items.length < 4) return { transitionEntropy: 1.0, isPeriodicCycle: false, cycleLength: 0 };

  const { transitions, stateCounts } = buildTransitionMaps(items);
  const conditionalEntropy = computeConditionalEntropy(transitions, stateCounts, items.length - 1);
  const cycle = detectPeriodicCycle(items);

  return {
    transitionEntropy: Number(conditionalEntropy.toFixed(3)),
    isPeriodicCycle: cycle.isPeriodicCycle,
    cycleLength: cycle.cycleLength
  };
}

function calculateShannonEntropy(actionEvents = [], windowSize = 50) {
  const sample = actionEvents.slice(-windowSize);
  const totalActions = sample.length;
  if (totalActions === 0) return emptyEntropyResult();

  const stats = computeEntropyStats(sample);
  const { transitionEntropy, isPeriodicCycle, cycleLength } = getTransitionEntropy(sample);
  const maxEntropy = stats.uniqueActions > 1 ? Math.log2(stats.uniqueActions) : 1;
  const sparkline = buildSparkline(sample, totalActions);
  const drift = classifyDrift({
    totalActions,
    uniqueActions: stats.uniqueActions,
    dominanceRatio: stats.dominanceRatio,
    normalizedEntropy: stats.normalizedEntropy,
    transitionEntropy,
    isPeriodicCycle,
    cycleLength
  });

  return {
    entropy: Number(stats.entropy.toFixed(3)),
    rawEntropy: Number(stats.entropy.toFixed(3)),
    normalizedEntropy: drift.normalizedEntropy,
    maxPossibleEntropy: Number(maxEntropy.toFixed(3)),
    state: drift.driftState,
    cognitiveDriftState: drift.driftState,
    uniqueActions: stats.uniqueActions,
    uniqueActionCount: stats.uniqueActions,
    sampleSize: totalActions,
    dominanceRatio: Number(stats.dominanceRatio.toFixed(3)),
    transitionEntropy,
    isPeriodicCycle,
    cycleLength,
    reasonCode: drift.reasonCode || null,
    diagnosticRecommendation: drift.diagnostic,
    sparkline
  };
}

function detectDeadlocks(messageQueue = [], chattyThreshold = 6) {
  const queue = Array.isArray(messageQueue) ? messageQueue : [];
  const interactions = {};
  const messageGraph = {};

  collectMessageGraph(queue, interactions, messageGraph);
  const chattyLoops = findChattyLoops(interactions, chattyThreshold);
  const circularDeadlocks = findCircularDeadlocks(messageGraph);

  return {
    deadlockDetected: circularDeadlocks.length > 0 || chattyLoops.length > 0,
    chattyLoops,
    circularDeadlocks,
    starvedAgents: []
  };
}

const SYSTEM_NODES = [
  { id: 'system-orchestrator', name: 'System Orchestrator', role: 'supervisor', cluster: 'System', tier: 'Ultra', status: 'active' },
  { id: 'system-telemetry', name: 'Telemetry Observer', role: 'observer', cluster: 'System', tier: 'Flash', status: 'active' },
  { id: 'system-worker', name: 'Idle Worker Pool', role: 'worker', cluster: 'System', tier: 'Pro', status: 'idle', parentAgentId: 'system-orchestrator' }
];

function getSwarmTopology(agentList = [], eventBuffer = []) {
  const agents = agentList.length > 0 ? agentList : SYSTEM_NODES;
  const agentById = new Map(agents.map(agentIdPair));
  const nodes = buildTopologyNodes(agents);
  const edges = [];
  const addEdge = makeEdgeAdder(agentById, edges);

  addLineageAndPeerEdges(agents, addEdge);
  const particles = collectTelemetryEdges(eventBuffer, agentById, addEdge);

  return {
    timestamp: new Date().toISOString(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
    particles,
    communityClusters: []
  };
}

module.exports = {
  calculateShannonEntropy,
  detectDeadlocks,
  getSwarmTopology
};
