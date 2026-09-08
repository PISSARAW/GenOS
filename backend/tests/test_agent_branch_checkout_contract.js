const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const source = { id: 'commit-main', agent_id: 'agent-1', workspace_id: 'ws', ref_name: 'main', state_json: JSON.stringify({ name: 'Agent', role: 'worker', status: 'idle', cognitive_budget: 55 }) };
let writes = [];
dbModule.getDatabase = async () => ({
  get: async (sql, ...args) => {
    if (sql.includes('agent_state_snapshots')) return source;
    return { id: 'agent-1', workspace_id: 'ws', name: 'Agent', role: 'worker', status: 'idle' };
  },
  run: async (sql, ...args) => { writes.push({ sql, args }); return { changes: 1 }; }
});
delete require.cache[require.resolve('../src/controllers/lineageController')];
const { branchAgentState, checkoutAgentState } = require('../src/controllers/lineageController');
function response() { let result; return { res: { status: (code) => ({ json: (body) => { result = { code, body }; } }), json: (body) => { result = { code: 200, body }; } }, get: () => result }; }
(async () => {
  const branch = response();
  await branchAgentState({ body: { agentId: 'agent-1', refName: 'feature' }, tenant: { organizationId: 'org', projectId: 'project' } }, branch.res);
  assert.equal(branch.get().code, 201);
  assert.equal(branch.get().body.refName, 'feature');
  const checkout = response();
  await checkoutAgentState({ body: { agentId: 'agent-1', refName: 'main', reset: true }, tenant: { organizationId: 'org', projectId: 'project' } }, checkout.res);
  assert.equal(checkout.get().code, 200);
  assert.equal(checkout.get().body.reset, true);
  assert.ok(writes.some((entry) => entry.sql.includes('UPDATE agents')));
  console.log('Agent branch and checkout contract passed.');
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = originalGetDatabase; });
