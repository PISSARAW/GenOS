'use strict';

const utils = require('./conflictUtils');

function detect({ operation, history }) {
  const path = utils.pathOf(operation);
  const conflicts = [];
  for (const prior of history) {
    if (!utils.concurrentPair(prior, operation)) continue;
    if (references(operation, utils.pathOf(prior)) || references(prior, path)) {
      conflicts.push(utils.conflict({ type: 'DEPENDENCY_CONFLICT', left: prior, right: operation, description: 'Concurrent operations declare a dependency on each other’s target.' }));
    }
  }
  return conflicts;
}

function references(operation, path) {
  return Array.isArray(operation.intent?.dependencies) && operation.intent.dependencies.includes(path);
}

module.exports = { detect };
