'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-local-scope-'));
const dbPath = path.join(root, 'local.db');
const saved = Object.fromEntries(['NODE_ENV', 'GENOS_DB_PATH', 'GENOS_WORKSPACE_ROOT',
  'GENOS_LOCAL_ORGANIZATION_ID', 'GENOS_LOCAL_PROJECT_ID', 'GENOS_DB_BACKUP_SKIP']
  .map((key) => [key, process.env[key]]));

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.GENOS_DB_PATH = dbPath;
  process.env.GENOS_WORKSPACE_ROOT = root;
  process.env.GENOS_LOCAL_ORGANIZATION_ID = 'org-local-test';
  process.env.GENOS_LOCAL_PROJECT_ID = 'project-local-test';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  const database = require('../src/db');
  try {
    const db = await database.getDatabase(dbPath);
    const workspace = await db.get("SELECT organization_id, project_id FROM workspaces WHERE id = 'ws-local'");
    assert.deepEqual(workspace, { organization_id: 'org-local-test', project_id: 'project-local-test' });
    const project = await db.get('SELECT organization_id, status FROM projects WHERE id = ?', 'project-local-test');
    assert.deepEqual(project, { organization_id: 'org-local-test', status: 'active' });
  } finally {
    await database.closeDatabase();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().then(() => console.log('Local workspace bootstrap tenant scope: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
