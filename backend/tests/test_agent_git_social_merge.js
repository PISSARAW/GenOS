'use strict';

const assert = require('node:assert/strict');
const { mergeChildrenGoverned } = require('../src/services/agentGitService/mergeDrivers.cjs');

const merged = mergeChildrenGoverned({
  base: [{ id: 'agent-1', role: 'worker', lineage_relation: 'child' }],
  left: [{ id: 'agent-1', role: 'reviewer', lineage_relation: 'child' }],
  right: [{ id: 'agent-1', role: 'worker', lineage_relation: 'independent' }]
});
assert.equal(merged.merged.length, 0);
assert.equal(merged.conflicts[0].type, 'divergent_relationship');
assert.equal(merged.conflicts[0].resolution, 'required');

const compatible = mergeChildrenGoverned({
  base: [{ id: 'agent-1', role: 'worker' }],
  left: [{ id: 'agent-1', role: 'reviewer' }],
  right: [{ id: 'agent-1', role: 'worker' }, { id: 'agent-2', role: 'worker' }]
});
assert.deepEqual(compatible.merged, [{ id: 'agent-1', role: 'reviewer' }, { id: 'agent-2', role: 'worker' }]);
assert.deepEqual(compatible.conflicts, []);
console.log('AgentGit social merge passed.');
