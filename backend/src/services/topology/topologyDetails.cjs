'use strict';

function topologyDetails(composition) {
  if (!composition) return {};
  return {
    organization: composition.organization,
    capabilityContract: composition.capabilityContract,
    sessionId: composition.sessionId || composition.rhizomeId || null,
    graphVersion: composition.graphVersion ?? null
  };
}

module.exports = { topologyDetails };