'use strict';

const migrationPolicy = require('../migration/migrationPolicyService');
const { routableMigrationAction } = require('./variantFlowActions');

function balancedActions(observed, input) {
  return selectedMigrationActions(observed, input, 'complementary');
}

function resilientActions(observed, input) {
  return selectedMigrationActions(observed, input, 'rescue');
}

function selectedMigrationActions(observed, input, policy) {
  const candidates = migrationPolicy.selectCandidates(input.migrationCandidates, {
    policy, limit: input.limit
  });
  return candidates.map((candidate) => routableMigrationAction({
    candidate, observed, input, reason: policy
  })).filter(Boolean);
}

module.exports = { balancedActions, resilientActions };
