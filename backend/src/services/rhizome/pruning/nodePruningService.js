'use strict';

function propose(session) {
  const activeNeeds = session.activeNeeds || [];
  return (session.nodes || []).filter((node) => ['DORMANT', 'DEGRADED', 'RETIRED'].includes(node.state)).map((node) => {
    const uniqueCapabilities = node.capabilities.filter((capability) => activeNeeds.some((need) => need.capability === capability)
      && !session.nodes.some((other) => other.nodeId !== node.nodeId && ['ACTIVE', 'AVAILABLE'].includes(other.state) && other.capabilities.includes(capability)));
    return { nodeId: node.nodeId, action: uniqueCapabilities.length ? 'FOSSILIZE' : 'PRUNE', protectedCapabilities: uniqueCapabilities };
  });
}

module.exports = { propose };
