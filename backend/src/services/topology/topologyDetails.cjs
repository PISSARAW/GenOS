'use strict';

const SESSION_KEYS = Object.freeze([
  'sessionId', 'rhizomeId', 'communityId', 'holobiontId',
  'metapopulationId', 'biomeId'
]);

function sessionIdentity(composition) {
  const key = SESSION_KEYS.find((candidate) => composition[candidate]);
  return key ? composition[key] : null;
}

function topologyDetails(composition) {
  if (!composition) return {};
  return {
    organization: composition.organization,
    capabilityContract: composition.capabilityContract,
    sessionId: sessionIdentity(composition),
    communityId: composition.communityId || null,
    holobiontId: composition.holobiontId || null,
    metapopulationId: composition.metapopulationId || null,
    graphVersion: composition.graphVersion ?? null
  };
}

module.exports = { topologyDetails };
