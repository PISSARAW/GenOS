const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD = 'test-incident-password';
process.env.GENOS_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'genos-incident-')), 'incident.db');
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
  assert.equal(reported.error, null);
  assert.equal(reported.value.status, 'reported');
  console.log('gRPC incident tenant scope checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
