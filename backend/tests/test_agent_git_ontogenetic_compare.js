'use strict';

const assert = require('node:assert/strict');
const { compareIdentity, compareCapabilities, summarizeRuns } = require('../src/services/agentGitService/ontogeneticOps.cjs');

assert.deepEqual(compareIdentity({ name: 'A', role: 'worker' }, { name: 'A', role: 'reviewer' }), {
  stable: false, changedFields: ['role']
});
assert.deepEqual(compareCapabilities([{ plasmid_id: 'a' }, { plasmid_id: 'b' }], [{ plasmid_id: 'b' }, { plasmid_id: 'c' }]), {
  preservedPlasmids: ['b'], lostPlasmids: ['a'], acquiredPlasmids: ['c']
});
assert.deepEqual(summarizeRuns([
  { status: 'completed', budget_json: '{"consumed":4}' },
  { status: 'failed', budget_json: '{"consumed":2}' }
]), { count: 2, statuses: { completed: 1, failed: 1 }, budgetConsumed: 6 });
console.log('AgentGit ontogenetic comparison passed.');
