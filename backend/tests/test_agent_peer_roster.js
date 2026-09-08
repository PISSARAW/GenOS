const assert = require('node:assert/strict');
const { inbox } = require('../src/services/dynamicOrganizationService');

const queries = [];
const db = {
  async exec() {},
  async get(sql) {
    if (sql.includes('agent_organization_state')) return { orchestratorId: 'orch', organization: 'flocking_boids', version: 1, policyJson: '{}', policy: { routing: 'broadcast' } };
    if (sql.includes('agents')) return { id: 'worker', role: 'worker', execution_mode: 'worker' };
    return null;
  },
  async all(sql) {
    queries.push(sql);
    if (sql.includes('agent_organization_messages')) return [{ id: 1, senderAgentId: 'peer-1', recipientAgentId: null, organization: 'flocking_boids', organizationVersion: 1, content: 'hello', delivery: 'delivered' }];
    return [{ id: 'orch', name: 'Griot-a1', nameMeaning: 'guide', role: 'orchestrator', executionMode: 'orchestrator' }, { id: 'peer-1', name: 'Nia-b2', nameMeaning: 'purpose', role: 'worker', executionMode: 'worker' }];
  }
};

inbox(db, { orchestratorId: 'orch', requesterAgentId: 'worker' }).then((result) => {
  assert.equal(result.members.find((member) => member.id === 'peer-1').name, 'Nia-b2');
  assert.ok(queries.some((sql) => sql.includes('sender.name')));
  console.log('Agent peer roster and message identity are exposed.');
}).catch((error) => { console.error(error); process.exitCode = 1; });