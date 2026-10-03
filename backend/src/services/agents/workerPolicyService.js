'use strict';

const POLICIES = Object.freeze({
  scout_cell: { maxIterations: 1 }
});

function workerPolicy(kind) {
  return POLICIES[kind] || {};
}

module.exports = { POLICIES, workerPolicy };
