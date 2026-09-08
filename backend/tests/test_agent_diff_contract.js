const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const agents = {
  left: { id: 'left', name: 'Left', role: 'worker', agent_type: 'GenOS', execution_mode: 'worker', model_tier: 'standard', language: 'TypeScript', lineage_relation: 'fork', status: 'idle', is_apoptotic: 0, cognitive_budget: 80, cognitive_baseline_budget: 100, dissonance_level: 2, eureka_count: 1, parent_agent_id: 'root', workspace_id: 'ws' },
  right: { id: 'right', name: 'Right', role: 'worker', agent_type: 'GenOS', execution_mode: 'worker', model_tier: 'standard', language: 'TypeScript', lineage_relation: 'clone', status: 'idle', is_apoptotic: 0, cognitive_budget: 60, cognitive_baseline_budget: 100, dissonance_level: 4, eureka_count: 1, parent_agent_id: 'root', workspace_id: 'ws' }
};
dbModule.getDatabase = async () => ({
  get: async (sql, id) => {
    if (sql.includes('FROM agents a LEFT JOIN workspaces')) return agents[id];
    if (sql.includes('genome_decisions')) return { count: 2 };
    if (sql.includes('strategy_execution_runs')) return { count: 1 };
    if (sql.includes('telemetry_events')) return { count: 3 };
    if (sql.includes('parent_agent_id')) return { count: 0 };
    throw new Error(`Unexpected query: ${sql}`);
  }
});

delete require.cache[require.resolve('../src/controllers/lineageController')];
const { diffAgents } = require('../src/controllers/lineageController');
let result;
const res = { status: (code) => ({ json: (body) => { result = { code, body }; } }), json: (body) => { result = { code: 200, body }; } };

diffAgents({ body: { leftAgentId: 'left', rightAgentId: 'right' }, tenant: { organizationId: 'org', projectId: 'project' } }, res)
  .then(() => {
    assert.equal(result.code, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.identical, false);
    assert.ok(result.body.differences.some((item) => item.path === 'conscience.cognitiveBudget'));
    console.log('Agent diff contract passed.');
  })
  .catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(() => { dbModule.getDatabase = originalGetDatabase; });
