import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-codex-agent-'));
const dbPath = path.join(root, 'genos.db');
const envKeys = ['GENOS_DB_PATH', 'GENOS_WORKSPACE_ROOT', 'GENOS_LOCAL_ORGANIZATION_ID',
  'GENOS_LOCAL_PROJECT_ID', 'GENOS_AGENT_ID', 'GENOS_ORCHESTRATOR_AGENT_ID',
  'GENOS_CODEX_AUTO_PROVISION_IDENTITY', 'GENOS_EXECUTION_MODE', 'GENOS_DB_BACKUP_SKIP',
  'GENOS_DB_BOOTSTRAP_SKIP', 'GENOS_ADMIN_PASSWORD', 'NODE_ENV'];
const previous = new Map(envKeys.map((key) => [key, process.env[key]]));

function setTestEnvironment() {
  Object.assign(process.env, {
    GENOS_DB_PATH: dbPath,
    GENOS_WORKSPACE_ROOT: root,
    GENOS_LOCAL_ORGANIZATION_ID: 'codex-test-org',
    GENOS_LOCAL_PROJECT_ID: 'codex-test-project',
    GENOS_CODEX_AUTO_PROVISION_IDENTITY: '1',
    GENOS_DB_BACKUP_SKIP: '1',
    GENOS_ADMIN_PASSWORD: 'codex-identity-test-password',
    NODE_ENV: 'test'
  });
  delete process.env.GENOS_AGENT_ID;
  delete process.env.GENOS_ORCHESTRATOR_AGENT_ID;
  delete process.env.GENOS_EXECUTION_MODE;
}

function restoreTestEnvironment() {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function main() {
  setTestEnvironment();
  const database = require('../backend/src/db');
  try {
    const db = await database.getDatabase(dbPath);
    const { ensureCallerIdentity } = require('./callerIdentity.cjs');
    const first = await ensureCallerIdentity(db, { workspaceRoot: root });
    const second = await ensureCallerIdentity(db, { workspaceRoot: root });
    const row = await db.get('SELECT id, name, role, execution_mode, workspace_id, parent_agent_id, metadata_json FROM agents WHERE id = ?', first.agentId);
    assert.equal(first.agentId, second.agentId);
    assert.equal(first.orchestratorId, first.agentId);
    assert.equal(row.name, 'Codex Workspace Orchestrator');
    assert.equal(row.role, 'orchestrator');
    assert.equal(row.execution_mode, 'orchestrator');
    assert.equal(row.workspace_id, 'ws-local');
    assert.equal(row.parent_agent_id, null);
    assert.equal(JSON.parse(row.metadata_json).managedIdentity.integration, 'codex-mcp');
    console.log('Codex MCP first use persists one real workspace-scoped GenOS agent.');
  } finally {
    await database.closeDatabase();
    restoreTestEnvironment();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
