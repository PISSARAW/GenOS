const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const agents = {
  left: { id: 'left', workspace_id: 'ws', name: 'Left', role: 'worker', status: 'idle', cognitive_budget: 80 },
  right: { id: 'right', workspace_id: 'ws', name: 'Right', role: 'reviewer', status: 'idle', cognitive_budget: 60 }
};
const objects = {
  source: { id: 'obj-source', agent_id: 'left', workspace_id: 'ws', object_kind: 'commit', state_hash: 'hash-source', state_json: JSON.stringify({ schema: 'genos.agent-git-state/v1', agent: agents.left, decisions: [], memories: [], runs: [], plasmids: [], permissions: [], events: [], children: [] }) },
  second: { id: 'obj-second', agent_id: 'left', workspace_id: 'ws', object_kind: 'commit', state_hash: 'hash-second', state_json: JSON.stringify({ schema: 'genos.agent-git-state/v1', agent: { ...agents.left, cognitive_budget: 40 }, decisions: [], memories: [], runs: [], plasmids: [], permissions: [], events: [], children: [] }) }
};
const writes = [];
dbModule.getDatabase = async () => ({
  get: async (sql, ...args) => {
    if (sql.includes('FROM agents a')) return agents[args[0]] || null;
    if (sql.includes('FROM agent_git_objects')) return objects.source;
    return null;
  },
  all: async (sql) => sql.includes('agent_git_objects') ? [objects.source, objects.second] : [],
  run: async (sql, ...args) => { writes.push({ sql, args }); return { changes: 1 }; }
});
delete require.cache[require.resolve('../src/services/agentGitService')];
const service = require('../src/services/agentGitService');
objects.source.state_hash = service.hashState(JSON.parse(objects.source.state_json));
objects.source.metadata_json = JSON.stringify({ locked: false });
objects.source.signature = service.signObject(objects.source.state_hash, JSON.parse(objects.source.metadata_json));
const req = { body: { leftAgentId: 'left', rightAgentId: 'right', agentId: 'left', objectId: 'obj-source', targetAgentId: 'right', field: 'agent.cognitive_budget', expectedValue: 80, resolution: 'ours' }, tenant: { organizationId: 'org', projectId: 'project' }, user: { username: 'tester' } };
(async () => {
  const diff = await service.diff(req);
  assert.equal(diff.success, true);
  assert.ok(Array.isArray(diff.changedSections));
  const merge = await service.merge(req);
  assert.equal(merge.success, true);
  const replay = await service.replay(req);
  assert.equal(replay.success, true);
  assert.equal(replay.replayVerified, true);
  const bisect = await service.bisect(req);
  assert.equal(bisect.success, true);
  assert.match(bisect.complexity, /O\(log2/);
  assert.ok(writes.some((entry) => entry.sql.includes('agent_git_objects')));
  console.log('Advanced composite agent git operations passed.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = originalGetDatabase; });
