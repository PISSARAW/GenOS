'use strict';

const assert = require('node:assert/strict');
const { ensureCallerIdentity } = require('./callerIdentity.cjs');

class MemoryDatabase {
  constructor() {
    this.workspaces = new Map([['C:\\workspace', { id: 'ws-local' }]]);
    this.agents = new Map();
    this.inserts = 0;
  }

  async get(sql, id) {
    if (sql.includes('FROM workspaces')) return this.workspaces.get(id) || null;
    if (sql.includes('execution_mode = \'orchestrator\'')) {
      const row = this.agents.get(id);
      return row?.execution_mode === 'orchestrator' ? row : null;
    }
    return this.agents.get(id) || null;
  }

  async run(_sql, ...values) {
    const [id, name, role, mode, workspaceId, parentId, metadataJson] = values;
    this.inserts += 1;
    if (this.agents.has(id)) return;
    this.agents.set(id, { id, name, role, execution_mode: mode, workspace_id: workspaceId,
      parent_agent_id: parentId, metadata_json: metadataJson });
  }
}

async function provisionsStableWorkspaceRoot() {
  const db = new MemoryDatabase();
  const env = { GENOS_CODEX_AUTO_PROVISION_IDENTITY: '1' };
  const first = await ensureCallerIdentity(db, { env, workspaceRoot: 'C:\\workspace' });
  const second = await ensureCallerIdentity(db, { env, workspaceRoot: 'C:\\workspace' });
  assert.match(first.agentId, /^codex_[a-f0-9]{32}$/);
  assert.equal(first.agentId, second.agentId);
  assert.equal(first.orchestratorId, first.agentId);
  assert.equal(db.inserts, 1);
}

async function provisionsWorkerUnderTrustedParent() {
  const db = new MemoryDatabase();
  db.agents.set('root-a', { id: 'root-a', execution_mode: 'orchestrator', workspace_id: 'ws-local' });
  const identity = await ensureCallerIdentity(db, { env: {
    GENOS_CODEX_AUTO_PROVISION_IDENTITY: '1', GENOS_ORCHESTRATOR_AGENT_ID: 'root-a'
  }, workspaceRoot: 'C:\\workspace' });
  const worker = db.agents.get(identity.agentId);
  assert.equal(worker.execution_mode, 'worker');
  assert.equal(worker.parent_agent_id, 'root-a');
  assert.equal(identity.orchestratorId, 'root-a');
}

async function refusesUntrustedOrMissingScope() {
  await assert.rejects(() => ensureCallerIdentity(new MemoryDatabase(), { env: {
    GENOS_EXECUTION_MODE: 'worker', GENOS_CODEX_AUTO_PROVISION_IDENTITY: '1'
  }, workspaceRoot: 'C:\\workspace' }), /requires its trusted GENOS_ORCHESTRATOR_AGENT_ID/);
  await assert.rejects(() => ensureCallerIdentity(new MemoryDatabase(), { env: {} }), /GENOS_AGENT_ID is required/);
}

async function rejectsUnownedConfiguredWorker() {
  const db = new MemoryDatabase();
  db.agents.set('orphan', { id: 'orphan', execution_mode: 'worker', workspace_id: 'ws-local' });
  await assert.rejects(() => ensureCallerIdentity(db, { env: { GENOS_AGENT_ID: 'orphan' } }), /without an owning orchestrator/);
}

(async () => {
  await provisionsStableWorkspaceRoot();
  await provisionsWorkerUnderTrustedParent();
  await refusesUntrustedOrMissingScope();
  await rejectsUnownedConfiguredWorker();
  console.log('Codex MCP caller identity provisioning is scoped, persistent, idempotent and fail-closed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
