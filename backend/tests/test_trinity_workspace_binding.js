'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const preparation = require('../src/services/trinityDispatchPreparation');
const { hashWorkspace } = require('../src/services/trinitySnapshotService');
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trinity-binding-'));
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const source = path.join(root, 'source'), clone = path.join(root, 'clone');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'answer.js'), 'module.exports = 1;');
    await fs.cp(source, clone, { recursive: true });
    const hash = await hashWorkspace(clone);
    await db.exec('CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, path TEXT, visibility TEXT, language TEXT, tags TEXT, organization_id TEXT, project_id TEXT); CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT); CREATE TABLE trinity_experiments (id TEXT PRIMARY KEY, mission_snapshot_hash TEXT); CREATE TABLE trinity_worlds (agent_id TEXT, experiment_id TEXT, workspace_root TEXT, snapshot_hash TEXT, status TEXT)');
    await db.run('INSERT INTO workspaces (id, path, organization_id, project_id) VALUES (?, ?, ?, ?)', 'parent-ws', source, 'org', 'project');
    await db.run('INSERT INTO agents VALUES (?, ?)', 'worker', 'parent-ws');
    await db.run('INSERT INTO trinity_experiments VALUES (?, ?)', 'experiment', hash);
    await db.run('INSERT INTO trinity_worlds (agent_id, experiment_id) VALUES (?, ?)', 'worker', 'experiment');
    const input = { scope: { trinityExperimentId: 'experiment' }, workerId: 'worker', workspaceRoot: clone };
    const id = await preparation.bindWorker(db, input);
    const workspace = await db.get('SELECT * FROM workspaces WHERE id = ?', id);
    assert.equal(workspace.visibility, 'Private');
    assert.equal(workspace.organization_id, 'org');
    assert.equal(workspace.project_id, 'project');
    assert.equal((await db.get('SELECT workspace_id FROM agents WHERE id = ?', 'worker')).workspace_id, id);
    assert.equal(await preparation.bindWorker(db, input), id);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM workspaces WHERE id = ?', id)).n, 1);
    await db.run('INSERT INTO agents VALUES (?, ?)', 'unbound', 'parent-ws');
    await assert.rejects(preparation.bindWorker(db, { ...input, workerId: 'unbound' }), { code: 'TRINITY_WORKER_SCOPE_INVALID' });
    assert.equal((await db.get('SELECT workspace_id FROM agents WHERE id = ?', 'unbound')).workspace_id, 'parent-ws');
    assert.equal(await db.get('SELECT id FROM workspaces WHERE id = ?', 'trinity_workspace_unbound'), undefined);
    await fs.writeFile(path.join(clone, 'answer.js'), 'tampered');
    await assert.rejects(preparation.bindWorker(db, input), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
    console.log('Trinity private tenant inheritance, idempotent binding and transactional rollback: PASS');
  } finally {
    await db.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
