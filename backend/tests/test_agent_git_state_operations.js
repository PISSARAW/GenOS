const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const writes = [];
dbModule.getDatabase = async () => ({
  get: async (sql, ...args) => {
    if (sql.includes('agent_git_objects')) return null;
    if (sql.includes('FROM agents a')) return { id: 'agent-1', workspace_id: 'ws', name: 'Agent', role: 'worker', status: 'idle', cognitive_budget: 50 };
    return null;
  },
  all: async () => [],
  run: async (sql, ...args) => { writes.push({ sql, args }); return { changes: 1 }; }
});
delete require.cache[require.resolve('../src/services/agentGitService')];
const service = require('../src/services/agentGitService');
const req = { body: { agentId: 'agent-1', refName: 'main', remoteName: 'registry' }, tenant: { organizationId: 'org', projectId: 'project' }, user: { username: 'tester' } };
(async () => {
  const commit = await service.createCommit(req, { agentId: 'agent-1', refName: 'main' });
  assert.equal(commit.kind, 'commit');
  const push = await service.push(req);
  assert.equal(push.success, true);
  const stash = await service.stash(req);
  assert.equal(stash.kind, 'stash');
  const tag = await service.tag({ ...req, body: { ...req.body, tagName: 'stable-1' } });
  assert.equal(tag.kind, 'tag');
  assert.ok(writes.length >= 4);
  console.log('Composite agent git state operations passed.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = originalGetDatabase; });
