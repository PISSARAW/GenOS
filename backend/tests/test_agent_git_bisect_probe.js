'use strict';

const assert = require('node:assert/strict');
const { probeCheckpoint } = require('../src/services/agentGitService/bisect.cjs');

const invalid = { id: 'bad-commit', state_json: JSON.stringify({ runs: [{ budget_json: '{"allocated":2,"consumed":3}' }] }) };
const valid = { id: 'good-commit', state_json: JSON.stringify({ runs: [{ budget_json: '{"allocated":3,"consumed":2}' }] }) };
const validator = (state) => ({ budgetsConsistent: state.runs.every((run) => {
  const budget = JSON.parse(run.budget_json);
  return budget.consumed <= budget.allocated;
}) });

assert.deepEqual(probeCheckpoint(valid, 'budgetsConsistent', validator), { objectId: 'good-commit', result: true });
assert.deepEqual(probeCheckpoint(invalid, 'budgetsConsistent', validator), { objectId: 'bad-commit', result: false });
console.log('AgentGit deterministic bisect probe passed.');
