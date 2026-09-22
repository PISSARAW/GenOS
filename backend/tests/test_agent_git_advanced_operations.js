'use strict';

const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const agents = {
  left: { id: 'left', workspace_id: 'ws', name: 'Left', role: 'worker', status: 'idle', cognitive_budget: 80 },
  right: { id: 'right', workspace_id: 'ws', name: 'Right', role: 'reviewer', status: 'idle', cognitive_budget: 60 }
};
const stateLeft = { schema: 'genos.agent-git-state/v1', agent: agents.left, decisions: [], memories: [], runs: [], plasmids: [], permissions: [], events: [], children: [] };
const stateRight = { schema: 'genos.agent-git-state/v1', agent: agents.right, decisions: [], memories: [], runs: [], plasmids: [], permissions: [], events: [], children: [] };

dbModule.getDatabase = async () => ({
  get: async (sql, ...args) => {
    if (sql.includes('FROM agents a') || sql.includes('FROM agents')) {
      const id = args[0];
      return agents[id] || agents.left;
    }
    if (sql.includes('agent_git_objects')) {
      // Return different objects based on the ID
      const id = args[0];
      if (id === 'left') return { id: 'obj-left', agent_id: 'left', workspace_id: 'ws', object_kind: 'commit', state_hash: 'hash-left', state_json: JSON.stringify(stateLeft), metadata_json: '{}', signature: null };
      if (id === 'right') return { id: 'obj-right', agent_id: 'right', workspace_id: 'ws', object_kind: 'commit', state_hash: 'hash-right', state_json: JSON.stringify(stateRight), metadata_json: '{}', signature: null };
      return { id: 'obj-left', agent_id: 'left', workspace_id: 'ws', object_kind: 'commit', state_hash: 'hash-left', state_json: JSON.stringify(stateLeft), metadata_json: '{}', signature: null };
    }
    return null;
  },
  all: async (sql) => {
    if (sql.includes('agent_git_objects')) {
      return [
        { id: 'obj-left', agent_id: 'left', workspace_id: 'ws', object_kind: 'commit', state_hash: 'hash-left', state_json: JSON.stringify(stateLeft), metadata_json: '{}', signature: null },
        { id: 'obj-right', agent_id: 'right', workspace_id: 'ws', object_kind: 'commit', state_hash: 'hash-right', state_json: JSON.stringify(stateRight), metadata_json: '{}', signature: null }
      ];
    }
    return [];
  },
  run: async () => ({ changes: 1 })
});

for (const key of Object.keys(require.cache)) {
  if (key.includes('agentGitService') || key.includes('canonical') || key.includes('commitGraph') || key.includes('storeObjectHelper') || key.includes('dagOperations') || key.includes('headIndex') || key.includes('replaceStateHelpers') || key.includes('mergeHelpers')) {
    delete require.cache[key];
  }
}

const service = require('../src/services/agentGitService');
const req = { body: { leftAgentId: 'left', rightAgentId: 'right', agentId: 'left' }, tenant: { organizationId: 'org', projectId: 'project' }, user: { username: 'tester' } };

(async () => {
  const diff = await service.diff(req);
  assert.equal(diff.success, true);
  assert.ok(Array.isArray(diff.changedSections));
  console.log('Advanced composite agent git operations passed.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = originalGetDatabase; });
