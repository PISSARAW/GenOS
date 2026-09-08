const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD = 'test-incident-password';
const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
dbModule.getDatabase = async () => ({
  run: async () => ({ changes: 1 }),
  all: async () => []
});
const service = require('../src/grpc_services/incidentService');

function call(method, request) {
  return new Promise((resolve) => service[method]({ request }, (error, value) => resolve({ error, value })));
}

(async () => {
  const missing = await call('GetIncidentHistory', {});
  assert.equal(missing.error.code, 3);
  const reported = await call('ReportIncident', {
    agent_id: 'agent-1',
    reason: 'scoped incident',
    organization_id: 'org-test',
    project_id: 'project-test',
    details_json: '{}'
  });
  assert.equal(reported.error, undefined);
  assert.equal(reported.value.status, 'reported');
  console.log('gRPC incident tenant scope checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = originalGetDatabase; });
