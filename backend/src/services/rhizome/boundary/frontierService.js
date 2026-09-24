'use strict';

function activeNodeIds(nodes) {
  return new Set(nodes.filter((node) => ['ACTIVE', 'AVAILABLE'].includes(node.state)
    && node.availability?.status !== 'UNAVAILABLE').map((node) => node.nodeId));
}

function startingNodes(session, eligible) {
  const locusNodes = (session.coordinationLoci || []).map((locus) => locus.holderNodeId).filter((id) => eligible.has(id));
  return locusNodes.length ? locusNodes : [...eligible];
}

function reachableNodes(session) {
  const eligible = activeNodeIds(session.nodes || []);
  const visited = new Set(startingNodes(session, eligible));
  const queue = [...visited];
  while (queue.length) {
    const from = queue.shift();
    for (const edge of session.edges || []) {
      if (edge.from === from && edge.status === 'ACTIVE' && eligible.has(edge.to) && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return visited;
}

module.exports = { reachableNodes };
