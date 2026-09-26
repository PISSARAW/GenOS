'use strict';

const failureDetector = require('./routeFailureDetector');
const alternatives = require('./alternativePathService');

function repair(input) {
  const failedEdgeIds = failureDetector.failedEdges(input.session, input.receipt, input.trustedVerifierDigests || []);
  const result = alternatives.find({
    session: input.session, need: input.need, failedEdgeIds,
    policy: input.session.variantPolicy?.routing || {}
  });
  return {
    repaired: result.selected,
    reason: result.selected ? 'ALTERNATIVE_ROUTE_FOUND' : 'CAPABILITY_GAP_REMAINS',
    excludedEdgeIds: failedEdgeIds,
    ...result
  };
}

module.exports = { repair };
