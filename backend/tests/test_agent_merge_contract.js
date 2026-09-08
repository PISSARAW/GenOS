const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const agents = {
  left: { id: 'left', name: 'Left', role: 'architect', workspace_id: 'ws', cognitive_budget: 80, cognitive_baseline_budget: 100, cognitive_max_dissonance: 50, dissonance_level: 2, eureka_count: 1, model_tier: 'standard', language: 'TypeScript' },
  right: { id: 'right', name: 'Right', role: 'reviewer', workspace_id: 'ws', cognitive_budget: 60, cognitive_baseline_budget: 90, cognitive_max_dissonance: 40, dissonance_level: 4, eureka_count: 2, model_tier: 'standard', language: 'TypeScript' }
};
const writes = [];
dbModule.getDatabase = async () => ({
  get: async (sql, id) => sql.includes('FROM agents a LEFT JOIN workspaces') ? agents[id] : { count: 0 },
  run: async (sql, ...args) => { writes.push({ sql, args }); return { changes: 1 }; }
});
delete require.cache[require.resolve('../src/controllers/lineageController')];
const { mergeAgents } = require('../src/controllers/lineageController');
let result;
const res = { status: (code) => ({ json: (body) => { result = { code, body }; } }), json: (body) => { result = { code: 200, body }; } };
mergeAgents({ body: { leftAgentId: 'left', rightAgentId: 'right' }, tenant: { organizationId: 'org', projectId: 'project' } }, res)
  .then(() => {
    assert.equal(result.code, 201);
    assert.equal(result.body.success, true);
    assert.deepEqual(result.body.parentAgentIds, ['left', 'right']);
    assert.equal(result.body.cognitiveBudget, 60);
    assert.equal(writes.filter((entry) => entry.sql.includes("edge_type, metadata")).length, 2);
    console.log('Agent merge contract passed.');
  })
  .catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(() => { dbModule.getDatabase = originalGetDatabase; });
