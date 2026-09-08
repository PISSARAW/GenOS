const assert = require('node:assert/strict');
const { publish, inbox } = require('../src/services/dynamicOrganizationService');

const calls = [];
const db = {
  async exec() {},
  async get(sql, id) {
    if (sql.includes('agent_organization_state')) return { orchestratorId: 'orch', organization: 'flocking_boids', version: 1, policyJson: '{}', policy: { routing: 'broadcast' } };
    if (sql.includes('LEFT JOIN workspaces')) return { organizationId: 'org-a', projectId: 'project-a' };
    if (id === 'orch') return { id, role: 'orchestrator', execution_mode: 'orchestrator' };
    return { id, role: 'worker', execution_mode: 'worker' };
  },
  async run(sql, ...args) { calls.push({ sql, args }); return { lastID: 1 }; },
  async all(sql) {
    if (sql.includes('agent_organization_messages')) return [];
    return [];
  }
};

publish(db, { orchestratorId: 'orch', senderAgentId: 'worker', content: 'scoped' }).then(() => {
  const insert = calls.find((call) => call.sql.includes('organization_id, project_id'));
  assert.deepEqual(insert.args.slice(-2), ['org-a', 'project-a']);
  console.log('Agent organization messages carry tenant scope.');
}).catch((error) => { console.error(error); process.exitCode = 1; });