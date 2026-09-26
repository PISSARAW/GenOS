'use strict';

const failureDetector = require('./routeFailureDetector');
const alternatives = require('./alternativePathService');

function repair(input) {
  const failedEdgeIds = failureDetector.failedEdges(input.session, input.receipt, input.trustedVerifierDigests || []);
  const policy = input.session.variantPolicy?.routing || {};
  const maxRounds = Number.isInteger(policy.maxSelfRepairRounds) ? Math.max(1, policy.maxSelfRepairRounds)
    : (input.session.variantPolicy?.resilience?.maxSelfRepairRounds != null
        ? Math.max(1, input.session.variantPolicy.resilience.maxSelfRepairRounds)
        : 1);
  const excluded = new Set(failedEdgeIds);
  const collected = [];
  for (let round = 1; round <= maxRounds; round++) {
    const result = alternatives.find({
      session: input.session, need: input.need, failedEdgeIds: [...excluded],
      policy
    });
    if (!result.selected) break;
    collected.push(result.route);
    result.route.edgeIds.forEach((edgeId) => excluded.add(edgeId));
  }
  const route = collected[0] || null;
  return {
    repaired: Boolean(route),
    reason: route ? 'ALTERNATIVE_ROUTE_FOUND' : 'CAPABILITY_GAP_REMAINS',
    excludedEdgeIds: [...failedEdgeIds],
    route,
    alternatives: collected
  };
}

module.exports = { repair };
