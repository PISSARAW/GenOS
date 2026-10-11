'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-state-restore-'));
process.env.GENOS_DB_PATH = path.join(temporary, 'test.db');
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_MCP_LEASE = 'genos_temporal_consciousness_transfer';
process.env.GENOS_MCP_ALLOW_AGENT_RESTORE = 'true';
process.env.GENOS_MCP_ORGANIZATION_ID = 'mcp-restore-org';
process.env.GENOS_MCP_PROJECT_ID = 'mcp-restore-project';
process.env.NODE_ENV = 'test';

const { getDatabase, closeDatabase } = require('../src/db');
const { snapshotAgentState, verifyOrganismSnapshot } = require('../src/controllers/lineage/snapshots');
const { dispatchTool } = require('../src/services/mcpToolRegistry');

function response() {
  let value;
  return { res: { status: (code) => ({ json: (body) => { value = { code, body }; } }),
    json: (body) => { value = { code: 200, body }; } }, get: () => value };
}

async function fixture(db, workspacePath) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('mcp-restore-org', 'Restore Org')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('mcp-restore-project', 'mcp-restore-org', 'Restore Project')");
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    ['mcp-restore-workspace', 'Restore Workspace', workspacePath, 'mcp-restore-org', 'mcp-restore-project']);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id,
    cognitive_budget, current_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ['mcp-restore-agent', 'Restore Agent', 'tester', 'idle', 'orchestrator', 'mcp-restore-workspace', 80, 'baseline']);
}

async function run() {
  const workspacePath = path.join(temporary, 'workspace');
  const filePath = path.join(workspacePath, 'state.txt');
  fs.mkdirSync(workspacePath);
  fs.writeFileSync(filePath, 'baseline');
  try {
    const db = await getDatabase();
    await fixture(db, workspacePath);
    const saved = response();
    await snapshotAgentState({ body: { agentId: 'mcp-restore-agent', reason: 'mcp contract' },
      tenant: { organizationId: 'mcp-restore-org', projectId: 'mcp-restore-project' } }, saved.res);
    assert.equal(saved.get().code, 201);
    const snapshotId = saved.get().body.snapshotId;
    const sealedRow = await db.get('SELECT state_json FROM agent_state_snapshots WHERE id = ?', [snapshotId]);
    const integrity = verifyOrganismSnapshot(JSON.parse(sealedRow.state_json));
    assert.equal(integrity.valid, true, JSON.stringify(integrity));
    await db.run("UPDATE agents SET cognitive_budget = 2, current_task = 'mutated' WHERE id = 'mcp-restore-agent'");
    fs.writeFileSync(filePath, 'mutated');

    process.env.GENOS_MCP_ALLOW_AGENT_RESTORE = 'false';
    const disabled = await dispatchTool('genos_temporal_consciousness_transfer', {
      action: 'restore_snapshot', agent_id: 'mcp-restore-agent', baseline_snapshot_id: snapshotId });
    assert.equal(disabled.result.success, false);
    process.env.GENOS_MCP_ALLOW_AGENT_RESTORE = 'true';

    const missingScope = process.env.GENOS_MCP_PROJECT_ID;
    process.env.GENOS_MCP_PROJECT_ID = 'wrong-project';
    const denied = await dispatchTool('genos_temporal_consciousness_transfer', {
      action: 'restore_snapshot', agent_id: 'mcp-restore-agent', baseline_snapshot_id: snapshotId });
    assert.equal(denied.result.success, false);
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'mutated');
    process.env.GENOS_MCP_PROJECT_ID = missingScope;

    await db.run("UPDATE agents SET runtime_pid = 123 WHERE id = 'mcp-restore-agent'");
    const active = await dispatchTool('genos_temporal_consciousness_transfer', {
      action: 'restore_snapshot', agent_id: 'mcp-restore-agent', baseline_snapshot_id: snapshotId });
    assert.equal(active.result.success, false);
    await db.run("UPDATE agents SET runtime_pid = NULL WHERE id = 'mcp-restore-agent'");

    const restored = await dispatchTool('genos_temporal_consciousness_transfer', {
      action: 'restore_snapshot', agent_id: 'mcp-restore-agent', baseline_snapshot_id: snapshotId });
    assert.equal(restored.result.success, true, restored.result.error || restored.result.output);
    assert.equal(restored.result.status, 'agent_state_restored');
    assert.equal(restored.result.consciousnessTransferred, false);
    assert.equal(restored.result.futureMemoriesInjected, 0);
    assert.equal(restored.result.workspaceRestored, true);
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'baseline');
    const agent = await db.get('SELECT cognitive_budget, current_task FROM agents WHERE id = ?', ['mcp-restore-agent']);
    assert.equal(agent.cognitive_budget, 80);
    assert.equal(agent.current_task, 'baseline');
    console.log('MCP sealed agent-state restore and cross-scope refusal verified.');
  } finally {
    await closeDatabase();
    assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    try { fs.rmSync(temporary, { recursive: true, force: true }); }
    catch (error) { console.warn(`Temporary test cleanup failed: ${error.message}`); }
  }
}

run().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
