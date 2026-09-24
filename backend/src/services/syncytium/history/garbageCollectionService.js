'use strict';

const stability = require('./causalStabilityService');

function collect(session) {
  const frontier = stability.stableFrontier(session);
  const result = session.crdt.compact(frontier);
  return {
    ...result,
    stableFrontier: frontier,
    retainedOps: session.crdt.getHistory().length,
    checkpoint: session.crdt.getSnapshot().compactedOps
  };
}

module.exports = { collect };
