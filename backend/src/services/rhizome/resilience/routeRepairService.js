'use strict';

const failureDetector = require('./routeFailureDetector');
const alternatives = require('./alternativePathService');

function repair(input) {
  const failedEdgeIds = failureDetector.failedEdges(input.session, input.receipt, input.trustedVerifierDigests || []);
  const policy = input.session.variantPolicy?.routing || {};
  const result = searchWithReconfiguration(input, failedEdgeIds, policy);
  return {
    repaired: result.selected,
    reason: result.selected ? 'ALTERNATIVE_ROUTE_FOUND' : 'CAPABILITY_GAP_REMAINS',
    excludedEdgeIds: [...excluded],
    route: result.route,
    alternatives: result.alternatives
  };
}

function searchWithReconfiguration(input, failedEdgeIds, policy) {
  const configuredRounds = input.session.variantPolicy?.resilience?.maxSelfRepairRounds;
  const maxRounds = Number.isInteger(configuredRounds) ? Math.max(1, configuredRounds) : 1;
  const baseHops = Number(policy.maxHops) || input.session.nodes.length;
  for (let round = 0; round < maxRounds; round += 1) {
    const result = alternatives.find({
      session: input.session, need: input.need, failedEdgeIds,
      policy: { ...policy, maxHops: baseHops + round }
    });
    if (result.selected) return result;
  }
  return { selected: false, route: null, alternatives: [] };
}

module.exports = { repair };
