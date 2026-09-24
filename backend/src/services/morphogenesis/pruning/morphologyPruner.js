'use strict';

function planPruning(nodes = []) {
  const candidates = nodes.filter((node) => node && node.necessity && node.necessity.pruneCandidate)
    .map((node) => ({ nodeId: node.id, action: node.critical ? 'dormant' : 'prune', preserveEvidence: true }));
  return { candidates, requiresPromotionGate: candidates.some((item) => item.action === 'prune') };
}

module.exports = { planPruning };
