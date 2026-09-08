const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const writes = [];
const state = { schema: 'genos.agent-git-state/v1', agent: { id: 'agent-1', workspace_id: 'ws', name: 'A', role: 'worker', cognitive_budget: 10 }, decisions: [], memories: [], runs: [], plasmids: [], permissions: [], events: [{ event_type: 'TOOL', created_at: '2026-01-01' }], children: [] };
dbModule.getDatabase = async () => ({
  get: async (sql) => {
    if (sql.includes('agent_git_objects')) return { id: 'one', agent_id: 'agent-1', object_kind: 'commit', ref_name: 'main', remote_name: null, state_hash: service.hashState(state), state_json: JSON.stringify(state), metadata_json: JSON.stringify({ locked: false }), signature: null, created_at: '2026-01-01' };
    if (sql.includes('FROM agents a')) return state.agent;
    return null;
  },
  all: async (sql) => sql.includes('agent_git_objects') ? [{ id: 'one', agent_id: 'agent-1', object_kind: 'commit', ref_name: 'main', remote_name: null, state_hash: 'hash', state_json: JSON.stringify(state), metadata_json: JSON.stringify({ locked: false }), signature: null, created_at: '2026-01-01' }] : [],
  run: async (sql, ...args) => { writes.push({ sql, args }); return { changes: 1 }; }
});
delete require.cache[require.resolve('../src/services/agentGitService')];
const service = require('../src/services/agentGitService');
const req = { body: { agentId: 'agent-1', objectId: 'one', field: 'agent.cognitive_budget', expectedValue: 10, refName: 'main' }, tenant: { organizationId: 'org', projectId: 'project' }, user: { username: 'tester' } };
(async () => {
  const log = await service.log(req); assert.equal(log.success, true); assert.equal(log.objects.length, 1);
  const replay = await service.replay(req); assert.equal(replay.runtimeReplay.eventCount, 1);
  const bisect = await service.bisect(req); assert.equal(bisect.success, false); // one object is insufficient
  const remote = await service.receiveRemote({ body: { remoteName: 'registry', object: { id: 'remote', agentId: 'agent-1', workspaceId: 'ws', refName: 'main', stateHash: 'hash' }, state }, user: { username: 'remote' }, ip: '127.0.0.1' });
  assert.equal(remote.success, true);
  assert.ok(writes.some((entry) => entry.sql.includes('signature')));
  console.log('Advanced agent-git features passed.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = originalGetDatabase; });
