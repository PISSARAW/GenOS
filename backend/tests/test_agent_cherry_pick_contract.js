const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
let update;
const agents = {
  source: { id: 'source', workspace_id: 'ws', name: 'Source', role: 'reviewer', current_task: 'review task', cognitive_budget: 88, cognitive_baseline_budget: 100, dissonance_level: 2, eureka_count: 5 },
  target: { id: 'target', workspace_id: 'ws', name: 'Target', role: 'worker' }
};
dbModule.getDatabase = async () => ({
  get: async (sql, id) => sql.includes('FROM agents a LEFT JOIN workspaces') ? agents[id] : null,
  run: async (sql, ...args) => { update = { sql, args }; return { changes: 1 }; }
});
delete require.cache[require.resolve('../src/controllers/lineageController')];
const { cherryPickAgentState } = require('../src/controllers/lineageController');
let result;
const res = { status: (code) => ({ json: (body) => { result = { code, body }; } }), json: (body) => { result = { code: 200, body }; } };
cherryPickAgentState({ body: { sourceAgentId: 'source', targetAgentId: 'target', sections: ['conscience'] }, tenant: { organizationId: 'org', projectId: 'project' } }, res)
  .then(() => {
    assert.equal(result.code, 200);
    assert.equal(result.body.success, true);
    assert.deepEqual(result.body.sections, ['conscience']);
    assert.match(update.sql, /cognitive_budget/);
    assert.doesNotMatch(update.sql, /current_task/);
    console.log('Agent cherry-pick contract passed.');
  })
  .catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(() => { dbModule.getDatabase = originalGetDatabase; });
