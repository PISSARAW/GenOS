'use strict';

const POLICIES = Object.freeze({});

function workerPolicy(kind) {
  return POLICIES[kind] || {};
}

module.exports = { POLICIES, workerPolicy };
