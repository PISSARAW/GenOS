'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateGqwf } = require('../src/services/gqwf');
const workers = require('../src/services/gqwf/workers');
const workerBinding = require('../src/services/workerWorkspaceBindingService');
const workerWorkspace = require('../src/services/agentFleetWorkerWorkspace');
const missionExecution = require('../src/services/gqwf/missionExecution');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-worker-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'worker-cow-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'answer.txt'), 'parent');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, path TEXT NOT NULL, visibility TEXT,
      language TEXT, tags TEXT, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, parent_agent_id TEXT, workspace_id TEXT);
    CREATE TABLE agent_capsule_cleanup (agent_id TEXT PRIMARY KEY, workspace_root TEXT NOT NULL, epoch TEXT);`);
  await db.run(`INSERT INTO workspaces (id, name, path, visibility, organization_id, project_id)
    VALUES (?, 'Parent', ?, 'Private', 'org', 'project')`, 'workspace', workspacePath);
  await db.run('INSERT INTO agents (id, parent_agent_id, workspace_id) VALUES (?, ?, ?)',
    'parent', null, 'workspace');
  await migrateGqwf(db);
  return { db, parent, root, workspacePath };
}

async function completedWorker(context) {
  const opened = await workers.materializeWorker(context.db, {
    workerId: 'completed-worker', workspaceId: 'workspace', sourcePath: context.workspacePath
  });
  assert.equal(opened.backend, 'gqwf');
  assert.equal(opened.status, 'open');
  assert.equal(await context.db.get('SELECT 1 FROM agent_capsule_cleanup WHERE agent_id = ?', 'completed-worker'), undefined);
  await context.db.run('INSERT INTO agents (id, parent_agent_id, workspace_id) VALUES (?, ?, ?)',
    'completed-worker', 'parent', 'workspace');
  const privateWorkspaceId = await workerBinding.bindWorkerWorkspace(context.db, {
    parentId: 'parent', parentWorkspaceId: 'workspace', workerId: 'completed-worker', workspaceRoot: opened.path
  });
  const privateWorkspace = await context.db.get('SELECT path, tags FROM workspaces WHERE id = ?', privateWorkspaceId);
  assert.equal(privateWorkspace.path, opened.path);
  assert.match(privateWorkspace.tags, /gqwf-lease:/);
  assert((await workerBinding.delegation(context.db, {
    agent: { id: 'completed-worker', workspace_id: privateWorkspaceId },
    parent: { id: 'parent', workspace_id: 'workspace' }
  })).capsuleDispatchParentId === 'parent');
  assert.equal((await workers.bindWorker(context.db, {
    workerId: 'completed-worker', workspaceId: 'workspace', capsulePath: opened.path
  })).viewId, opened.viewId);
  await fs.writeFile(path.join(opened.path, 'answer.txt'), 'worker');
  await fs.writeFile(path.join(opened.path, 'new.txt'), 'candidate');
  const finalized = await workers.finalizeWorker(context.db, {
    workerId: 'completed-worker', outcomeStatus: 'completed'
  });
  assert.equal(finalized.status, 'released');
  assert.equal(finalized.outcome, 'completed');
  assert.notEqual(finalized.candidateHash, opened.baseHash);
  await assert.rejects(fs.access(opened.path), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(context.workspacePath, 'answer.txt'), 'utf8'), 'parent');
  assert.equal((await workers.finalizeWorker(context.db, {
    workerId: 'completed-worker', outcomeStatus: 'completed'
  })).candidateHash, finalized.candidateHash);
}

async function failedWorker(context) {
  const opened = await workers.materializeWorker(context.db, {
    workerId: 'failed-worker', workspaceId: 'workspace', sourcePath: context.workspacePath
  });
  await fs.writeFile(path.join(opened.path, 'answer.txt'), 'discarded');
  const finalized = await workers.finalizeWorker(context.db, {
    workerId: 'failed-worker', outcomeStatus: 'error'
  });
  assert.equal(finalized.status, 'discarded');
  assert.equal(finalized.outcome, 'discarded');
  assert.equal(finalized.candidateHash, null);
  await assert.rejects(fs.access(opened.path), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(context.workspacePath, 'answer.txt'), 'utf8'), 'parent');
}

async function legacySchemaMigration() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL);
      CREATE TABLE gqwf_worker_bindings (
        worker_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, capsule_path TEXT NOT NULL,
        base_hash TEXT NOT NULL, view_id TEXT NOT NULL UNIQUE, candidate_hash TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'captured', 'capture_failed')),
        error TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    await migrateGqwf(db);
    const columns = await db.all('PRAGMA table_info(gqwf_worker_bindings)');
    const names = columns.map((column) => column.name);
    assert(names.includes('lease_id'));
    assert(names.includes('backend'));
    assert(names.includes('outcome'));
  } finally {
    await db.close();
  }
}

function parentWorkspaceSelection(context) {
  const parent = { workspace_id: 'workspace', workspace_path: context.workspacePath };
  const leasePath = path.join(context.root, 'parent-lease');
  assert.equal(workerWorkspace.sourceWorkspace(parent, {
    workspaceRoot: leasePath, workspaceProvisioned: true,
    executionWorkspace: { backend: 'gqwf', path: leasePath }
  }), leasePath);
  assert.throws(() => workerWorkspace.sourceWorkspace(parent, {
    workspaceRoot: leasePath, workspaceProvisioned: true
  }), { code: 'WORKSPACE_ROOT_MISMATCH' });
}

function workerPayloadIdentity() {
  const lease = { backend: 'gqwf', leaseId: 'lease-id' };
  const mission = buildWorkerMission({ workspaceBackend: 'gqwf-worker',
    gqwfWorkerLease: lease });
  assert.equal(mission.workspaceBackend, 'gqwf-worker');
  assert.equal(mission.gqwfWorkerLease, lease);
  assert.equal(missionExecution.eligible({ normalizedMission: {
    executionPolicy: { gqwfV2: true }, workspaceBackend: 'gqwf-worker'
  } }), false);
}

async function main() {
  const context = await fixture();
  try {
    await legacySchemaMigration();
    parentWorkspaceSelection(context);
    workerPayloadIdentity();
    await completedWorker(context);
    await failedWorker(context);
    console.log('GQWF worker Copy-on-Write lifecycle: PASS');
  } finally {
    await context.db.close();
    assert.equal(path.dirname(context.root), context.parent);
    await fs.rm(context.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
