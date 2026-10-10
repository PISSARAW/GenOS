'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const { withTransaction } = require('../src/db');
const { bindWorkerWorkspace, delegation } = require('../src/services/workerWorkspaceBindingService');
const snapshots = require('../src/services/workspaceSnapshotStore');
const { cleanupWorkspace } = require('../src/services/agentWorkspaceLifecycleService');

async function bind(db, workspaceRoot) {
  return withTransaction(db, tx => bindWorkerWorkspace(tx, {
    parentId: 'parent', parentWorkspaceId: 'parent-ws', workerId: 'worker', workspaceRoot
  }));
}

async function main() {
  const base = path.resolve('.genos-agent-worlds');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'worker-workspace-binding-'));
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const parent = path.join(root, 'parent');
    const first = path.join(root, 'worker_run_1');
    const second = path.join(root, 'worker_run_2');
    await Promise.all([parent, first, second].map(folder => fs.mkdir(folder)));
    await fs.writeFile(path.join(parent, 'answer.txt'), 'parent');
    await fs.writeFile(path.join(first, 'answer.txt'), 'first');
    await fs.writeFile(path.join(second, 'answer.txt'), 'second');
    await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, path TEXT, visibility TEXT,
      language TEXT, tags TEXT, organization_id TEXT, project_id TEXT);
      CREATE TABLE agents (id TEXT PRIMARY KEY, parent_agent_id TEXT, workspace_id TEXT,
      status TEXT DEFAULT 'completed', runtime_pid INTEGER);
      CREATE TABLE agent_capsule_cleanup (agent_id TEXT PRIMARY KEY, workspace_root TEXT, epoch TEXT);
      CREATE TABLE workspace_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT, snapshot_hash TEXT,
      step_number INTEGER, label TEXT, author TEXT, reason TEXT, diff_summary TEXT, metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
      'parent-ws', 'Parent', parent, 'org', 'project');
    await db.run('INSERT INTO agents (id, parent_agent_id, workspace_id) VALUES (?, ?, ?)', 'parent', null, 'parent-ws');
    await db.run('INSERT INTO agents (id, parent_agent_id, workspace_id) VALUES (?, ?, ?)', 'worker', 'parent', 'parent-ws');
    await fs.writeFile(path.join(first, '.genos-epoch'), 'epoch-first');
    await db.run('INSERT INTO agent_capsule_cleanup VALUES (?, ?, ?)', 'worker', first, 'epoch-first');
    const firstId = await bind(db, first);
    assert.equal(await bind(db, first), firstId);
    const firstWorkspace = await db.get('SELECT * FROM workspaces WHERE id = ?', firstId);
    assert.equal(firstWorkspace.path, first);
    assert.equal(firstWorkspace.visibility, 'Private');
    assert.equal(firstWorkspace.organization_id, 'org');
    assert.equal(firstWorkspace.project_id, 'project');
    assert.equal((await db.get('SELECT workspace_id FROM agents WHERE id = ?', 'worker')).workspace_id, firstId);
    const authorized = await delegation(db, { agent: { id: 'worker', parent_agent_id: 'parent',
      workspace_id: firstId, execution_mode: 'worker' },
    parent: { id: 'parent', workspace_id: 'parent-ws', execution_mode: 'orchestrator' } });
    assert.equal(authorized.capsuleDispatchParentId, 'parent');
    assert.equal(require('../src/services/cedarAgentAuthority').authorize({
      principal: { id: 'parent', workspace_id: 'parent-ws', execution_mode: 'orchestrator' },
      resource: authorized, action: 'StartMission', workspaceId: firstId
    }), true);
    await db.run("UPDATE workspaces SET project_id = 'foreign' WHERE id = ?", firstId);
    assert.equal(await delegation(db, { agent: authorized,
      parent: { id: 'parent', workspace_id: 'parent-ws' } }), null);
    await db.run("UPDATE workspaces SET project_id = 'project' WHERE id = ?", firstId);
    const captured = await snapshots.capture({ db, workspace: firstWorkspace, agentId: 'worker' });
    assert.equal((await db.get('SELECT workspace_id FROM workspace_snapshots WHERE id = ?', captured.id)).workspace_id, firstId);
    const row = await snapshots.getSnapshot(db, firstId, captured.id);
    const manifest = await snapshots.readManifest(row);
    assert.ok(manifest.files.some(file => file.path === 'answer.txt'));
    assert.equal(await cleanupWorkspace(first, 'worker', { db }), 'workspace-snapshots-retained');
    await fs.access(first);
    await fs.writeFile(path.join(second, '.genos-epoch'), 'epoch-second');
    await db.run('INSERT INTO agent_capsule_cleanup VALUES (?, ?, ?)', 'worker_run_2', second, 'epoch-second');
    const secondId = await bind(db, second);
    assert.notEqual(firstId, secondId);
    assert.equal((await db.get('SELECT workspace_id FROM agents WHERE id = ?', 'worker')).workspace_id, secondId);
    assert.equal((await db.get('SELECT path FROM workspaces WHERE id = ?', firstId)).path, first);
    await db.run("DELETE FROM agent_capsule_cleanup WHERE agent_id = 'worker'");
    await db.run("UPDATE agent_capsule_cleanup SET agent_id = 'worker' WHERE agent_id = 'worker_run_2'");
    assert.equal(await cleanupWorkspace(second, 'worker', { db }), 'assigned-workspace-retained');
    await fs.access(second);
    await assert.rejects(bind(db, parent), { code: 'WORKER_WORKSPACE_BINDING_INVALID' });
    await fs.writeFile(path.join(second, '.genos-epoch'), 'tampered');
    assert.equal(await delegation(db, { agent: { id: 'worker', workspace_id: secondId },
      parent: { id: 'parent', workspace_id: 'parent-ws' } }), null);
    await assert.rejects(withTransaction(db, tx => bindWorkerWorkspace(tx, {
      parentId: 'parent', parentWorkspaceId: 'wrong', workerId: 'worker', workspaceRoot: first
    })), { code: 'WORKER_WORKSPACE_BINDING_INVALID' });
    assert.equal((await db.get('SELECT workspace_id FROM agents WHERE id = ?', 'worker')).workspace_id, secondId);
    console.log('Worker capsule registration, tenant binding, reuse and snapshot target: PASS');
  } finally {
    await db.close();
    assert.ok(root.startsWith(base + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
