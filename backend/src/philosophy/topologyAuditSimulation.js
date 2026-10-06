'use strict';

const GRAPHS = Object.freeze({
  isolated_critics: [[0, 4], [1, 4], [2, 4], [3, 4]],
  centralized: [[0, 1], [0, 2], [0, 3]],
  federated: [[0, 1], [1, 2], [2, 3]],
  peer_to_peer: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]],
});

function adjacent(edges, node) {
  return edges.filter((edge) => edge.includes(node)).map((edge) => edge.find((other) => other !== node));
}

function deliver(edges, origin) {
  const arrived = new Map([[origin, 0]]);
  const queue = [origin];
  const messages = [];
  while (queue.length) {
    const from = queue.shift();
    for (const to of adjacent(edges, from)) {
      messages.push({ from, to, round: arrived.get(from) + 1, duplicate: arrived.has(to) });
      if (arrived.has(to)) continue;
      arrived.set(to, arrived.get(from) + 1);
      queue.push(to);
    }
  }
  return { arrived, messages };
}

function simulateAuditDistribution(assessment, spec) {
  const edges = GRAPHS[spec.topology];
  if (!edges) throw new Error('unknown experimental topology');
  const origin = spec.seed % 4;
  const delivery = deliver(edges, origin);
  const outageEdges = edges.filter((edge) => !edge.includes((origin + 1) % 4));
  const outage = deliver(outageEdges, origin);
  const agents = [0, 1, 2, 3].map((id) => ({ id,
    received: delivery.arrived.has(id), verificationRequired: assessment.status !== 'satisfied' }));
  return { scope: 'deterministic-graph-simulation', origin, edges, agents,
    messages: delivery.messages, communicationCount: delivery.messages.length,
    convergenceRounds: Math.max(...delivery.arrived.values()),
    reachableAgentsAfterOutage: [0, 1, 2, 3].filter((id) => outage.arrived.has(id)).length,
    attribution: { origin, contractId: assessment.contractId }, actualRuntimeDispatch: false };
}

module.exports = { simulateAuditDistribution, GRAPHS };
