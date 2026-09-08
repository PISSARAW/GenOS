const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const agent = { id: 'agent-1', name: 'Agent', role: 'worker', status: 'idle', workspace_id: 'ws', cognitive_budget: 42, cognitive_baseline_budget: 100, dissonance_level: 3, eureka_count: 2, is_apoptotic: 0 };
let saved;
dbModule.getDatabase = async () => ({
  get: async (sql) => sql.includes('agent_state_snapshots') ? saved : agent,
  run: async (sql, ...args) => { if (sql.includes('INSERT INTO agent_state_snapshots')) saved = { id: args[0], agent_id: args[1], state_json: JSON.stringify(agent) }; return { changes: 1 }; }
});
delete require.cache[require.resolve('../src/controllers/lineageController')];
const { snapshotAgentState, restoreAgentState } = require('../src/controllers/lineageController');
const response = () => { let result; return { res: { status: (code) => ({ json: (body) => { result = { code, body }; } }), json: (body) => { result = { code: 200, body }; } }, get: () => result }; };
const first = response();
snapshotAgentState({ body: { agentId: 'agent-1' }, tenant: { organizationId: 'org', projectId: 'project' } }, first.res).then(() => {
  const snapshotId = first.get().body.snapshotId;
  assert.equal(first.get().code, 201);
  const second = response();
  return restoreAgentState({ body: { agentId: 'agent-1', snapshotId }, tenant: { organizationId: 'org', projectId: 'project' } }, second.res).then(() => {
    assert.equal(second.get().code, 200);
    assert.equal(second.get().body.restored, true);
    console.log('Agent state snapshot contract passed.');
  });
}).catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = originalGetDatabase; });
