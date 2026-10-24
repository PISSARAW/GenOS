'use strict';

const assert = require('node:assert/strict');
const { checkStateInvariants } = require('../src/services/agentGitService/verifyHelpers.cjs');

const issues = [];
checkStateInvariants({
  object: { id: 'commit-1' },
  state: {
    runs: [{ id: 'run-1', budget_json: '{"allocated":2,"consumed":3}' }],
    permissions: [{ permissions_json: '["mcp:write"]', denied_tools_json: '["mcp:write"]' }],
    decisions: [{ id: 'decision-1', synaptic_weight: 0 }]
  },
  issues
});
assert.deepEqual(issues.map(({ issue }) => issue), [
  'run_budget_exceeded', 'permission_denied_overlap', 'invalid_decision_weight'
]);
console.log('AgentGit fsck invariant checks passed.');
