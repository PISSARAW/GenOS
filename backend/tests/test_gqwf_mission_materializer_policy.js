'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const missionExecution = require('../src/services/gqwf/missionExecution');
const { provisionMissionWorkspace } = require('../src/services/agentWorkspaceLifecycleService');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-materializer-policy-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'policy-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'source.txt'), 'source');
  const db = await open({ filename: path.join(root, 'state.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT
    );`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'ws-policy', workspacePath);
  await migrateGqwf(db);
  return { parent, root, workspacePath, db };
}

function context(state, runId, materializer) {
  const executionPolicy = { gqwfV2: true, allowFileEdits: true };
  if (materializer !== undefined) executionPolicy.gqwfMaterializer = materializer;
  return {
    db: state.db,
    agentId: `agent-${runId}`,
    executable: 'codex',
    executionRun: { id: runId },
    dispatchedAgent: { execution_mode: 'orchestrator', workspace_id: 'ws-policy' },
    normalizedMission: {
      workspaceId: 'ws-policy',
      workspaceRoot: state.workspacePath,
      executionPolicy
    }
  };
}

async function verifyEarlyValidation(state) {
  const invalid = context(state, 'run-invalid', 'unknown-materializer-v1').normalizedMission;
  await assert.rejects(provisionMissionWorkspace(invalid, 'orchestrator'), {
    code: 'GQWF_MATERIALIZER_POLICY_INVALID'
  });
  const inactive = context(state, 'run-inactive', 'auto').normalizedMission;
  inactive.executionPolicy.gqwfV2 = false;
  await assert.rejects(provisionMissionWorkspace(inactive, 'orchestrator'), {
    code: 'GQWF_MATERIALIZER_POLICY_INACTIVE'
  });
  await assert.rejects(fs.stat(path.join(state.workspacePath, '.genos')), { code: 'ENOENT' });
}

async function verifyDefaultPolicy(state) {
  const ctx = context(state, 'run-default');
  const prepared = await missionExecution.prepareMissionWorkspace(ctx);
  assert.equal(prepared.materialization.backendId, 'portable-copy-v1');
  assert.equal(prepared.materialization.selectionReason, 'default_portable');
  const finalized = await missionExecution.finalizeMissionWorkspace({
    db: state.db, executionRunId: 'run-default', outcomeStatus: 'failed'
  });
  assert.deepEqual(finalized.materialization, prepared.materialization);
}

async function verifyAutoPolicy(state) {
  const ctx = context(state, 'run-auto', 'auto');
  const prepared = await missionExecution.prepareMissionWorkspace(ctx);
  const selected = prepared.materialization;
  assert.ok(['linux-overlayfs-v1', 'native-reflink-v1',
    'portable-copy-v1'].includes(selected.backendId));
  if (selected.backendId === 'linux-overlayfs-v1') {
    assert.equal(selected.selectionReason, 'auto_overlayfs');
  } else if (selected.backendId === 'native-reflink-v1') {
    assert.equal(selected.selectionReason, 'auto_reflink');
  } else {
    assert.match(selected.selectionReason, /^auto_portable_fallback:/);
  }
  const receipt = await createFabric(state.db).inspectMaterialization({
    workspaceId: 'ws-policy', leaseId: prepared.leaseId
  });
  assert.equal(receipt.backendId, selected.backendId);
  assert.equal(receipt.receiptHash, selected.receiptHash);
  const finalized = await missionExecution.finalizeMissionWorkspace({
    db: state.db, executionRunId: 'run-auto', outcomeStatus: 'failed'
  });
  assert.deepEqual(finalized.materialization, selected);
}

async function verifyExplicitReflink(state) {
  const capabilities = await createFabric(state.db).inspectMaterializers({ workspaceId: 'ws-policy' });
  const reflink = capabilities.find((entry) => entry.backendId === 'native-reflink-v1');
  assert.ok(reflink);
  const before = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  const ctx = context(state, 'run-reflink', 'native-reflink-v1');
  if (reflink.available) {
    const prepared = await missionExecution.prepareMissionWorkspace(ctx);
    assert.equal(prepared.materialization.backendId, 'native-reflink-v1');
    assert.equal(prepared.materialization.selectionReason, 'explicit_backend');
    await missionExecution.finalizeMissionWorkspace({
      db: state.db, executionRunId: 'run-reflink', outcomeStatus: 'failed'
    });
    return;
  }
  await assert.rejects(missionExecution.prepareMissionWorkspace(ctx),
    /native-reflink-v1.*unavailable/);
  const after = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  assert.equal(after.count, before.count);
  const failed = await missionExecution.session(state.db, 'run-reflink');
  assert.equal(failed.status, 'virtual');
  assert.equal(failed.lease_id, null);
  assert.match(failed.error, /native-reflink-v1.*unavailable/);
}

async function verifyExplicitOverlayfs(state) {
  const capabilities = await createFabric(state.db).inspectMaterializers({ workspaceId: 'ws-policy' });
  const overlay = capabilities.find((entry) => entry.backendId === 'linux-overlayfs-v1');
  assert.ok(overlay);
  const before = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  const ctx = context(state, 'run-overlayfs', 'linux-overlayfs-v1');
  if (overlay.available) {
    const prepared = await missionExecution.prepareMissionWorkspace(ctx);
    assert.equal(prepared.materialization.backendId, 'linux-overlayfs-v1');
    await missionExecution.finalizeMissionWorkspace({
      db: state.db, executionRunId: 'run-overlayfs', outcomeStatus: 'failed'
    });
    return;
  }
  await assert.rejects(missionExecution.prepareMissionWorkspace(ctx),
    /linux-overlayfs-v1.*unavailable/);
  const after = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  assert.equal(after.count, before.count);
}

async function main() {
  const state = await fixture();
  try {
    await verifyEarlyValidation(state);
    await verifyDefaultPolicy(state);
    await verifyAutoPolicy(state);
    await verifyExplicitReflink(state);
    await verifyExplicitOverlayfs(state);
    console.log('GQWF mission materializer policy checks passed.');
  } finally {
    await state.db.close();
    if (path.dirname(state.root) !== state.parent || !path.basename(state.root).startsWith('policy-')) {
      throw new Error('Refusing to remove an unmanaged GQWF materializer policy fixture.');
    }
    await fs.rm(state.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
