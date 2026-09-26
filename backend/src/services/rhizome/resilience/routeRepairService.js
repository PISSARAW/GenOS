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
  let excluded = new Set(failedEdgeIds);
  let lastResult = null;
  for (let round = 1; round <= maxRounds; round++) {
    const result = alternatives.find({
      session: input.session, need: input.need, failedEdgeIds: [...excluded],
      policy
    });
    lastResult = result;
    if (result.selected) {
      excluded = new Set([...excluded, ...result.route.edgeIds]);
      continue;
    }
    break;
  }
  const result = lastResult || { selected: false, route: null, alternatives: [] };
  return {
    repaired: result.selected,
    reason: result.selected ? 'ALTERNATIVE_ROUTE_FOUND' : 'CAPABILITY_GAP_REMAINS',
    excludedEdgeIds: [...excluded],
    route: result.route,
    alternatives: result.alternatives
  };
}

module.exports = { repair };
