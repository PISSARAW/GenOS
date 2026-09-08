const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
let writes = [];
dbModule.getDatabase = async () => ({
  get: async (sql) => sql.includes('agent_state_snapshots') ? { id: 'parent-commit' } : { id: 'agent-1', workspace_id: 'ws', name: 'Agent', role: 'worker', status: 'idle' },
  run: async (sql, ...args) => { writes.push({ sql, args }); return { changes: 1 }; }
});
delete require.cache[require.resolve('../src/controllers/lineageController')];
const { commitAgentState } = require('../src/controllers/lineageController');
let result;
const res = { status: (code) => ({ json: (body) => { result = { code, body }; } }), json: (body) => { result = { code: 200, body }; } };
commitAgentState({ body: { agentId: 'agent-1', message: 'checkpoint before mutation', refName: 'main' }, tenant: { organizationId: 'org', projectId: 'project' } }, res)
  .then(() => {
    assert.equal(result.code, 201);
    assert.equal(result.body.success, true);
    assert.equal(result.body.parentCommitId, 'parent-commit');
    assert.equal(writes.length, 1);
    assert.match(writes[0].sql, /commit_message/);
    console.log('Agent commit contract passed.');
  })
  .catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(() => { dbModule.getDatabase = originalGetDatabase; });
