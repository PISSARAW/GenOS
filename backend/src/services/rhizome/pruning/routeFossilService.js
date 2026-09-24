'use strict';

function create(session, edge) {
  const endpoints = new Map(session.nodes.map((node) => [node.nodeId, node]));
  const from = endpoints.get(edge.from);
  const to = endpoints.get(edge.to);
  return {
    fossilId: `fossil:${edge.edgeId}:v${session.graphVersion}`,
    gapSolved: (session.activeNeeds || []).find((need) => to.capabilities.includes(need.capability))?.needId || null,
    routeShape: [edge.from, edge.to],
    requiredCapabilities: [...new Set([...(from?.capabilities || []), ...(to?.capabilities || [])])],
    bridgeRecipes: edge.relation === 'BRIDGES' ? [edge.edgeId] : [],
    procedures: [],
    cost: edge.cost,
    evidence: [from?.provenance || [], to?.provenance || []].flat(),
    failureModes: edge.status === 'QUARANTINED' ? ['SECURITY_FAILURE'] : []
  };
}

module.exports = { create };
