'use strict';

const utils = require('./conflictUtils');

function detect({ operation, history }) {
  return history.filter((prior) => utils.concurrentPair(prior, operation)
    && Number.isInteger(prior.schemaVersion)
    && Number.isInteger(operation.schemaVersion)
    && prior.schemaVersion !== operation.schemaVersion)
    .map((prior) => utils.conflict({ type: 'SCHEMA_CONFLICT', left: prior, right: operation, description: 'Concurrent operations use different schema versions.' }));
}

module.exports = { detect };
