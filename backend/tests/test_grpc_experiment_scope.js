const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD = 'test-experiment-password';
process.env.GENOS_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'genos-experiment-')), 'experiment.db');

const { getDatabase, closeDatabase } = require('../src/db');
const service = require('../src/grpc_services/experimentService');

function call(method, request) {
  return new Promise((resolve) => service[method]({ request }, (error, value) => resolve({ error, value })));
}

(async () => {
  const db = await getDatabase();
  await db.run('INSERT OR IGNORE INTO organizations(id,name) VALUES(?,?)', 'org-exp', 'org-exp');
  await db.run('INSERT OR IGNORE INTO projects(id,organization_id,name) VALUES(?,?,?)', 'project-exp', 'org-exp', 'project-exp');
  await db.run('INSERT OR REPLACE INTO workspaces(id,name,path,organization_id,project_id) VALUES(?,?,?,?,?)', 'workspace-exp', 'workspace-exp', process.cwd(), 'org-exp', 'project-exp');
  const result = await call('RunExperiment', { name: 'scoped', workspace_id: 'workspace-exp', organization_id: 'org-exp', project_id: 'project-exp', config_json: '{}' });
  assert.equal(result.error, null);
  const row = await db.get('SELECT organization_id, project_id FROM experiments WHERE id = ?', result.value.experiment_id);
  assert.deepEqual(row, { organization_id: 'org-exp', project_id: 'project-exp' });
  await closeDatabase();
  console.log('gRPC experiment scope persistence checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
