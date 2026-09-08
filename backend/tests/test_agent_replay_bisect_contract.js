const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const snapshots = [
  { id: 's1', state_json: JSON.stringify({ cognitive_budget: 100 }), created_at: '2026-01-01' },
  { id: 's2', state_json: JSON.stringify({ cognitive_budget: 90 }), created_at: '2026-01-02' },
  { id: 's3', state_json: JSON.stringify({ cognitive_budget: 40 }), created_at: '2026-01-03' },
  { id: 's4', state_json: JSON.stringify({ cognitive_budget: 0 }), created_at: '2026-01-04' }
];
dbModule.getDatabase = async () => ({
  get: async (sql, ...args) => {
    if (sql.includes('agent_state_snapshots')) return snapshots.find((row) => row.id === args[0]);
    return { id: 'agent-1', workspace_id: 'ws' };
  },
  all: async () => snapshots
});
delete require.cache[require.resolve('../src/controllers/lineageController')];
const { replayAgentState, bisectAgentState } = require('../src/controllers/lineageController');
function response() { let result; return { res: { status: (code) => ({ json: (body) => { result = { code, body }; } }), json: (body) => { result = { code: 200, body }; } }, get: () => result }; }
(async () => {
  const replay = response();
  await replayAgentState({ body: { agentId: 'agent-1', snapshotId: 's2' }, tenant: { organizationId: 'org', projectId: 'project' } }, replay.res);
  assert.equal(replay.get().body.replayVerified, true);
  assert.equal(replay.get().body.state.cognitive_budget, 90);
  const bisect = response();
  await bisectAgentState({ body: { agentId: 'agent-1', field: 'cognitive_budget', expectedValue: 100 }, tenant: { organizationId: 'org', projectId: 'project' } }, bisect.res);
  assert.equal(bisect.get().body.anomalyFound, true);
  assert.equal(bisect.get().body.culpritSnapshotId, 's2');
  assert.match(bisect.get().body.complexity, /O\(log2/);
  console.log('Agent replay and bisect contract passed.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = originalGetDatabase; });
