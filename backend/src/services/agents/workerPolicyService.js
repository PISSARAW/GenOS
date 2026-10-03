'use strict';

const POLICIES = Object.freeze({
  scout_cell: { maxIterations: 1 },
  resident_daemon: { maxIterations: null, maxTimeMs: null }
});

function workerPolicy(kind) {
  return POLICIES[kind] || {};
}

module.exports = { POLICIES, workerPolicy };
