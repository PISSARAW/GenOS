function actionKey(item) {
  if (typeof item === 'string') return item;
  return item.type || item.action || 'generic_action';
}

function buildFrequencyMap(items) {
  const frequencies = {};
  for (const item of items) {
    const key = actionKey(item);
    frequencies[key] = (frequencies[key] || 0) + 1;
  }
  return frequencies;
}

function computeEntropyStats(sample) {
  const frequencies = buildFrequencyMap(sample);
  const totalActions = sample.length;
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

function buildTransitionMaps(items) {
  const transitions = {};
  const stateCounts = {};
  for (let i = 0; i < items.length - 1; i += 1) {
    const from = items[i];
    const to = items[i + 1];
    stateCounts[from] = (stateCounts[from] || 0) + 1;
    if (!transitions[from]) transitions[from] = {};
    transitions[from][to] = (transitions[from][to] || 0) + 1;
  }
  return { transitions, stateCounts };
}

function computeConditionalEntropy(transitions, stateCounts, totalTransitions) {
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
  return conditionalEntropy;
}

function detectPeriodicCycle(items) {
  for (const period of [1, 2, 3, 4, 5, 6, 7, 8, 12, 16]) {
    const minItems = period === 1 ? 4 : period * 2;
    if (items.length < minItems) continue;
    let matches = 0;
    let comparisons = 0;
    for (let i = period; i < items.length; i += 1) {
      comparisons += 1;
      if (items[i] === items[i - period]) matches += 1;
    }
    if (comparisons > 0 && (matches / comparisons) >= 0.85) {
      return { isPeriodicCycle: true, cycleLength: period };
    }
  }
  return { isPeriodicCycle: false, cycleLength: 0 };
}

function buildSparkline(sample, totalActions) {
  const sparkline = [];
  const pointCount = Math.min(7, totalActions);
  for (let i = 0; i < pointCount; i += 1) {
    const end = Math.max(1, Math.floor(((i + 1) * totalActions) / pointCount));
    sparkline.push(Number(computeEntropyStats(sample.slice(0, end)).normalizedEntropy.toFixed(3)));
  }
  return sparkline;
}

function collapseFlags(metrics) {
  const isDominantRepetition = (metrics.dominanceRatio >= 0.85 && metrics.totalActions >= 4) ||
    (metrics.totalActions >= 4 && metrics.uniqueActions === 1);
  const isEntropyCollapsed = metrics.normalizedEntropy < 0.20 && metrics.totalActions >= 4;
  const isDeadlockCycle = metrics.isPeriodicCycle;
  return { isDominantRepetition, isEntropyCollapsed, isDeadlockCycle };
}

function collapsedResult(metrics, flags) {
  if (metrics.isPeriodicCycle) {
    return {
      driftState: 'COLLAPSE_DEADLOCK',
      diagnostic: `Cyclic deadlock detected: periodic loop of length ${metrics.cycleLength} detected.`,
      reasonCode: 'PERIODIC_ACTION_CYCLE',
      normalizedEntropy: Number(Math.min(metrics.normalizedEntropy, metrics.transitionEntropy).toFixed(3))
    };
  }
  if (flags.isDominantRepetition) {
    return {
      driftState: 'COLLAPSE_DEADLOCK',
      diagnostic: `High repetition dominance (${Math.round(metrics.dominanceRatio * 100)}%): single action repetition collapse.`,
      reasonCode: 'DOMINANT_ACTION_REPETITION',
      normalizedEntropy: metrics.normalizedEntropy
    };
  }
  return {
    driftState: 'COLLAPSE_DEADLOCK',
    diagnostic: 'Low action entropy detected across a minimum window.',
    reasonCode: 'LOW_ACTION_ENTROPY',
    normalizedEntropy: metrics.normalizedEntropy
  };
}

function collapseResult(metrics, flags) {
  if (flags.isDominantRepetition || flags.isEntropyCollapsed || flags.isDeadlockCycle) {
    return collapsedResult(metrics, flags);
  }
  if (metrics.normalizedEntropy > 0.88 && metrics.uniqueActions >= 5 && metrics.totalActions >= 10) {
    return {
      driftState: 'SPIKE_CONFUSION',
      diagnostic: 'High entropy spike detected: erratic tool switching or hallucination loop.',
      reasonCode: 'HIGH_ACTION_ENTROPY',
      normalizedEntropy: metrics.normalizedEntropy
    };
  }
  return {
    driftState: 'OPTIMAL_EXPLORATION',
    diagnostic: 'Swarm operating within balanced exploration-exploitation parameters.',
    reasonCode: null,
    normalizedEntropy: metrics.normalizedEntropy
  };
}

function classifyDrift(metrics) {
  return collapseResult(metrics, collapseFlags(metrics));
}

function emptyEntropyResult() {
  return {
    entropy: 0,
    rawEntropy: 0,
    normalizedEntropy: 0,
    maxPossibleEntropy: 0,
    state: 'IDLE',
    cognitiveDriftState: 'IDLE',
    diagnosticRecommendation: 'No action events provided to compute entropy.',
    uniqueActions: 0,
    uniqueActionCount: 0,
    sampleSize: 0,
    dominanceRatio: 0,
    transitionEntropy: 0,
    isPeriodicCycle: false,
    cycleLength: 0,
    sparkline: []
  };
}

function collectMessageGraph(queue, interactions, messageGraph) {
  for (const msg of queue) {
    if (!msg || typeof msg !== 'object') continue;
    if (!msg.sender || !msg.recipient) continue;
    const key = [msg.sender, msg.recipient].sort().join('<->');
    if (!msg.hasDiff) {
      interactions[key] = (interactions[key] || 0) + 1;
    }
    if (!messageGraph[msg.sender]) messageGraph[msg.sender] = new Set();
    messageGraph[msg.sender].add(msg.recipient);
  }
}

function findChattyLoops(interactions, chattyThreshold) {
  return Object.entries(interactions)
    .filter(([_, count]) => count >= chattyThreshold)
    .map(([pair, count]) => ({
      pair,
      messageCount: count,
      severity: 'WARNING',
      recommendation: 'Force break conversation and require artifact generation'
    }));
}

function recordCycle(context, cycleNodes, neighbor) {
  const cycleStartIndex = cycleNodes.indexOf(neighbor);
  const canonicalCycleSlice = cycleNodes.slice(cycleStartIndex);
  const cycleKey = canonicalCycleSlice.join(' -> ');
  if (context.seenCycles.has(cycleKey)) return;
  context.seenCycles.add(cycleKey);
  context.circularDeadlocks.push({
    cycle: cycleKey,
    culprits: canonicalCycleSlice,
    detectedAt: new Date().toISOString()
  });
}

function checkCycle(context, node, path) {
  context.visited.add(node);
  context.recStack.add(node);

  const neighbors = Array.from(context.messageGraph[node] || []);
  for (const neighbor of neighbors) {
    if (!context.visited.has(neighbor)) {
      checkCycle(context, neighbor, [...path, neighbor]);
    } else if (context.recStack.has(neighbor)) {
      recordCycle(context, [...path, neighbor], neighbor);
    }
  }
  context.recStack.delete(node);
}

function findCircularDeadlocks(messageGraph) {
  const context = {
    messageGraph,
    visited: new Set(),
    recStack: new Set(),
    seenCycles: new Set(),
    circularDeadlocks: []
  };

  for (const node of Object.keys(messageGraph)) {
    if (!context.visited.has(node)) {
      checkCycle(context, node, [node]);
    }
  }
  return context.circularDeadlocks;
}

function agentIdPair(agent) {
  return [agent.id, agent];
}

function buildTopologyNode(agent, index, total) {
  const angle = (index / total) * 2 * Math.PI;
  const radius = agent.role === 'supervisor' ? 0 : agent.role === 'observer' ? 220 : 140;

  return {
    id: agent.id,
    label: agent.name || agent.id.replace(/_/g, ' ').toUpperCase(),
    role: agent.role,
    cluster: agent.cluster || 'General',
    tier: agent.tier || 'Pro',
    status: agent.status || 'active',
    x: Math.round(300 + radius * Math.cos(angle)),
    y: Math.round(250 + radius * Math.sin(angle)),
    tokenBurnRate: Number(agent.tokenBurnRate || 0),
    memoryUsageKb: Number(agent.memoryUsageKb || 0)
  };
}

function buildTopologyNodes(agents) {
  const nodes = [];
  for (let i = 0; i < agents.length; i += 1) {
    nodes.push(buildTopologyNode(agents[i], i, agents.length));
  }
  return nodes;
}

function makeEdgeAdder(agentById, edges) {
  const edgeKeys = new Set();
  return (from, to, type) => {
    if (!from || !to || from === to || !agentById.has(from) || !agentById.has(to)) return;
    const key = [from, to].sort().join('::');
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push({ from, to, type, particles: [] });
    }
  };
}

function addLineageAndPeerEdges(agents, addEdge) {
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
}

function parseTelemetryEvent(event) {
  try {
    return JSON.parse(event.payload_json || '{}');
  } catch {
    return {};
  }
}

function collectTelemetryEdges(eventBuffer, agentById, addEdge) {
  const particles = [];
  for (const event of eventBuffer) {
    const payload = parseTelemetryEvent(event);
    const sender = payload.sender || event.agent_id;
    const recipient = payload.recipient || payload.targetAgentId || payload.target_agent_id;
    addEdge(sender, recipient, 'telemetry');
    if (recipient && agentById.has(recipient)) {
      particles.push({ from: sender, to: recipient, eventId: event.id || event.created_at });
    }
  }
  return particles;
}

module.exports = {
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
};
