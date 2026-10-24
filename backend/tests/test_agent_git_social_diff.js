'use strict';

const assert = require('node:assert/strict');
const { compareRecords } = require('../src/services/agentGitService/socialOps.cjs');

const changes = compareRecords({
  section: 'children',
  before: [{ id: 'worker-1', role: 'worker', status: 'active', lineage_relation: 'child' }],
  after: [{ id: 'worker-1', role: 'reviewer', status: 'active', lineage_relation: 'child' }, { id: 'worker-2', role: 'worker' }]
});
assert.deepEqual(changes.map((change) => change.change), ['modified', 'added']);
assert.deepEqual(changes[0].fields, ['role']);

const permissions = compareRecords({
  section: 'permissions',
  before: [{ organization_id: 'org', project_id: 'p', permissions_json: '["read"]', denied_tools_json: '[]' }],
  after: [{ organization_id: 'org', project_id: 'p', permissions_json: '["read","write"]', denied_tools_json: '[]' }]
});
assert.deepEqual(permissions[0].fields, ['permissions_json']);
console.log('AgentGit social diff passed.');
