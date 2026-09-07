/**
 * GenOS Swarm Telemetry & Cognitive Entropy Service
 * Shannon entropy calculation, cognitive drift detection, topology graph & deadlock sentinel.
 */

function getEntropyStats(actionEvents = []) {
  const frequencies = {};
  for (const item of actionEvents) {
    const key = typeof item === 'string' ? item : (item.type || item.action || 'generic_action');
    frequencies[key] = (frequencies[key] || 0) + 1;
  }

  const totalActions = actionEvents.length;
  const uniqueActions = Object.keys(frequencies).length;
  let entropy = 0;
  let maxCount = 0;
  for (const count of Object.values(frequencies)) {
    if (count > maxCount) maxCount = count;
    const p = count / totalActions;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  const maxEntropy = uniqueActions > 1 ? Math.log2(uniqueActions) : 1;
  const dominanceRatio = totalActions > 0 ? maxCount / totalActions : 0;
  return {
    entropy,
    normalizedEntropy: maxEntropy > 0 ? entropy / maxEntropy : 0,
    uniqueActions,
    dominanceRatio
  };
}

function getTransitionEntropy(actionEvents = []) {
  const items = actionEvents.map((item) => typeof item === 'string' ? item : (item.type || item.action || 'generic_action'));
  if (items.length < 4) return { transitionEntropy: 1.0, isPeriodicCycle: false, cycleLength: 0 };

  const transitions = {};
  const stateCounts = {};
  for (let i = 0; i < items.length - 1; i += 1) {
    const from = items[i];
    const to = items[i + 1];
    stateCounts[from] = (stateCounts[from] || 0) + 1;
    if (!transitions[from]) transitions[from] = {};
    transitions[from][to] = (transitions[from][to] || 0) + 1;
  }

  const totalTransitions = items.length - 1;
  let conditionalEntropy = 0;

  for (const [from, toMap] of Object.entries(transitions)) {
    const fromCount = stateCounts[from];
    const pFrom = fromCount / totalTransitions;
    let stateCondEntropy = 0;
    for (const count of Object.values(toMap)) {
      const pTo = count / fromCount;
      if (pTo > 0) stateCondEntropy -= pTo * Math.log2(pTo);
    }
    conditionalEntropy += pFrom * stateCondEntropy;
  }

  // Check explicit short periodic cycle (period 1, 2, 3, or 4)
  let isPeriodicCycle = false;
  let cycleLength = 0;
  for (const period of [1, 2, 3, 4]) {
    const minItems = period === 1 ? 3 : period * 2;
    if (items.length >= minItems) {
      let matches = 0;
      let comparisons = 0;
      for (let i = period; i < items.length; i += 1) {
        comparisons += 1;
        if (items[i] === items[i - period]) matches += 1;
      }
      if (comparisons > 0 && (matches / comparisons) >= 0.85) {
        isPeriodicCycle = true;
        cycleLength = period;
        break;
      }
    }
  }

  return {
    transitionEntropy: Number(conditionalEntropy.toFixed(3)),
    isPeriodicCycle,
    cycleLength
  };
}

/**
 * Calculates Information-Theoretic Shannon Entropy H(A) = - sum(P(a_i) * log2(P(a_i)))
 * and transition Markov entropy to detect both raw collapse and periodic cyclic deadlocks.
 */
function calculateShannonEntropy(actionEvents = [], windowSize = 50) {
  const sample = actionEvents.slice(-windowSize);

  const totalActions = sample.length;
  if (totalActions === 0) {
    return { entropy: 0, normalizedEntropy: 0, state: 'IDLE', uniqueActions: 0, sampleSize: 0 };
  }

  let { entropy, normalizedEntropy, uniqueActions, dominanceRatio } = getEntropyStats(sample);
  const { transitionEntropy, isPeriodicCycle, cycleLength } = getTransitionEntropy(sample);

  const maxEntropy = uniqueActions > 1 ? Math.log2(uniqueActions) : 1;
  const sparkline = [];
  const pointCount = Math.min(7, totalActions);
  for (let i = 0; i < pointCount; i += 1) {
    const end = Math.max(1, Math.floor(((i + 1) * totalActions) / pointCount));
    sparkline.push(Number(getEntropyStats(sample.slice(0, end)).normalizedEntropy.toFixed(3)));
  }

  // Determine cognitive drift status
  let driftState = 'OPTIMAL_EXPLORATION';
  let diagnostic = 'Swarm operating within balanced exploration-exploitation parameters.';

  const isDominantRepetition = (dominanceRatio >= 0.85 && totalActions >= 4) || (totalActions >= 4 && uniqueActions === 1);
  const isEntropyCollapsed = normalizedEntropy < 0.20 && totalActions >= 4;
  const isDeadlockCycle = (isPeriodicCycle && totalActions >= (cycleLength === 1 ? 3 : cycleLength * 2)) ||
                          (totalActions >= 4 && transitionEntropy === 0 && uniqueActions <= 3);

  if (isDominantRepetition || isEntropyCollapsed || isDeadlockCycle) {
    driftState = 'COLLAPSE_DEADLOCK';
    if (isPeriodicCycle) {
      diagnostic = `Cyclic deadlock detected: periodic loop of length ${cycleLength} detected.`;
      normalizedEntropy = Number(Math.min(normalizedEntropy, transitionEntropy).toFixed(3));
    } else if (isDominantRepetition) {
      diagnostic = `High repetition dominance (${Math.round(dominanceRatio * 100)}%): single action repetition collapse.`;
    } else {
      diagnostic = 'Low entropy collapse detected: infinite repetition or frozen logic.';
    }
  } else if (normalizedEntropy > 0.88 && uniqueActions >= 5 && totalActions >= 10) {
    driftState = 'SPIKE_CONFUSION';
    diagnostic = 'High entropy spike detected: erratic tool switching or hallucination loop.';
  }

  return {
    rawEntropy: Number(entropy.toFixed(3)),
    normalizedEntropy,
    maxPossibleEntropy: Number(maxEntropy.toFixed(3)),
    uniqueActionCount: uniqueActions,
    sampleSize: totalActions,
    dominanceRatio: Number(dominanceRatio.toFixed(3)),
    transitionEntropy,
    isPeriodicCycle,
    cycleLength,
    cognitiveDriftState: driftState,
    diagnosticRecommendation: diagnostic,
    sparkline
  };
}

/**
 * Detects circular message deadlocks and chatty loops
 */
function detectDeadlocks(messageQueue = [], chattyThreshold = 6) {
  const interactions = {};
  const messageGraph = {};

  const queue = messageQueue;

  for (const msg of queue) {
    const key = [msg.sender, msg.recipient].sort().join('<->');
    if (!msg.hasDiff) {
      interactions[key] = (interactions[key] || 0) + 1;
    }
    if (!messageGraph[msg.sender]) messageGraph[msg.sender] = [];
    messageGraph[msg.sender].push(msg.recipient);
  }

  // Detect chatty loops (> threshold messages without code diff)
  const chattyLoops = Object.entries(interactions)
    .filter(([_, count]) => count >= chattyThreshold)
    .map(([pair, count]) => ({
      pair,
      messageCount: count,
      severity: 'WARNING',
      recommendation: 'Force break conversation and require artifact generation'
    }));

  // Detect circular dependency A -> B -> C -> A
  const circularDeadlocks = [];
  const visited = new Set();
  const recStack = new Set();

  function checkCycle(node, path) {
    visited.add(node);
    recStack.add(node);

    const neighbors = messageGraph[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        checkCycle(neighbor, [...path, neighbor]);
      } else if (recStack.has(neighbor)) {
        circularDeadlocks.push({
          cycle: [...path, neighbor].join(' -> '),
          culprits: [...path, neighbor],
          detectedAt: new Date().toISOString()
        });
      }
    }
    recStack.delete(node);
  }

  for (const node of Object.keys(messageGraph)) {
    if (!visited.has(node)) {
      checkCycle(node, [node]);
    }
  }

  return {
    deadlockDetected: circularDeadlocks.length > 0 || chattyLoops.length > 0,
    chattyLoops,
    circularDeadlocks,
    starvedAgents: []
  };
}

// Baseline system nodes keep the topology graph meaningful on fresh installs
// where no user agents have been deployed yet.
const SYSTEM_NODES = [
  { id: 'system-orchestrator', name: 'System Orchestrator', role: 'supervisor', cluster: 'System', tier: 'Ultra', status: 'active' },
  { id: 'system-telemetry', name: 'Telemetry Observer', role: 'observer', cluster: 'System', tier: 'Flash', status: 'active' },
  { id: 'system-worker', name: 'Idle Worker Pool', role: 'worker', cluster: 'System', tier: 'Pro', status: 'idle', parentAgentId: 'system-orchestrator' }
];

/**
 * Computes force-directed swarm topology graph with active message particles
 */
function getSwarmTopology(agentList = [], eventBuffer = []) {
  const agents = agentList.length > 0 ? agentList : SYSTEM_NODES;
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  // Build nodes with normalized graph layout coordinates
  const nodes = agents.map((ag, i) => {
    const angle = (i / agents.length) * 2 * Math.PI;
    const radius = ag.role === 'supervisor' ? 0 : ag.role === 'observer' ? 220 : 140;

    return {
      id: ag.id,
      label: ag.name || ag.id.replace(/_/g, ' ').toUpperCase(),
      role: ag.role,
      cluster: ag.cluster || 'General',
      tier: ag.tier || 'Pro',
      status: ag.status || 'active',
      x: Math.round(300 + radius * Math.cos(angle)),
      y: Math.round(250 + radius * Math.sin(angle)),
      tokenBurnRate: Number(ag.tokenBurnRate || 0),
      memoryUsageKb: Number(ag.memoryUsageKb || 0)
    };
  });

  // Relationships come from persisted agent metadata and real telemetry.
  const edges = [];
  const particles = [];

  const edgeKeys = new Set();
  const addEdge = (from, to, type) => {
    if (!from || !to || from === to || !agentById.has(from) || !agentById.has(to)) return;
    const key = [from, to].sort().join('::');
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push({ from, to, type, particles: [] });
    }
  };

  for (const agent of agents) addEdge(agent.parentAgentId, agent.id, 'lineage');
  for (let i = 0; i < agents.length; i += 1) {
    for (let j = i + 1; j < agents.length; j += 1) {
      const left = agents[i];
      const right = agents[j];
      if ((left.fleetId && left.fleetId === right.fleetId) ||
          (left.workspaceId && left.workspaceId === right.workspaceId)) {
        addEdge(left.id, right.id, left.fleetId ? 'fleet' : 'workspace');
      }
    }
  }

  for (const event of eventBuffer) {
    let payload = {};
    try { payload = JSON.parse(event.payload_json || '{}'); } catch {}
    const sender = payload.sender || event.agent_id;
    const recipient = payload.recipient || payload.targetAgentId || payload.target_agent_id;
    addEdge(sender, recipient, 'telemetry');
    if (recipient && agentById.has(recipient)) {
      particles.push({ from: sender, to: recipient, eventId: event.id || event.created_at });
    }
  }

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
