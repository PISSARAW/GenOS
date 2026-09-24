'use strict';

function assessNecessity(input = {}) {
  const withNode = Number.isFinite(input.utilityWithNode) ? input.utilityWithNode : 0;
  const withoutNode = Number.isFinite(input.utilityWithoutNode) ? input.utilityWithoutNode : 0;
  const necessity = withNode - withoutNode;
  const cost = Number.isFinite(input.cost) ? Math.max(0, input.cost) : 0;
  return { nodeId: input.nodeId || null, necessity, cost, pruneCandidate: cost >= 0.5 && necessity <= 0.1 };
}

module.exports = { assessNecessity };
