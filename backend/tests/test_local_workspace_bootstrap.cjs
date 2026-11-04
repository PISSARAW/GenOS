'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const bootstrap = require('../src/services/localWorkspaceBootstrap');

async function database() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE projects(id TEXT PRIMARY KEY,organization_id TEXT,name TEXT,status TEXT);
    CREATE TABLE workspaces(id TEXT PRIMARY KEY,name TEXT,path TEXT,visibility TEXT,
      language TEXT,description TEXT,tags TEXT,organization_id TEXT,project_id TEXT,updated_at TEXT);`);
  return db;
}

function config(name) {
  return { name, workspaceRoot: path.join(os.tmpdir(), 'bootstrap-scope', name),
    organizationId: 'organization', projectId: 'project' };
}

test('A second root preserves the existing caller workspace and receives a stable separate identity', async () => {
  const db = await database();
  try {
    const first = await bootstrap.ensure(db, config('source'));
    const second = await bootstrap.ensure(db, config('experiment'));
    assert.equal(first.id, 'ws-local');
    assert.notEqual(second.id, first.id);
    assert.equal((await db.get("SELECT path FROM workspaces WHERE id='ws-local'")).path, config('source').workspaceRoot);
    assert.equal((await bootstrap.ensure(db, config('experiment'))).id, second.id);
    assert.equal((await db.get('SELECT COUNT(*) count FROM workspaces')).count, 2);
  } finally { await db.close(); }
});

test('Bootstrap cannot relabel a path or project owned by another tenant', async () => {
  const db = await database();
  try {
    await bootstrap.ensure(db, config('source'));
    await assert.rejects(bootstrap.ensure(db, { ...config('source'), organizationId: 'foreign' }),
      { code: 'LOCAL_WORKSPACE_SCOPE_CONFLICT' });
    await assert.rejects(bootstrap.ensure(db, { ...config('other'), organizationId: 'foreign' }),
      { code: 'LOCAL_WORKSPACE_SCOPE_CONFLICT' });
    assert.equal((await db.get("SELECT organization_id FROM workspaces WHERE id='ws-local'")).organization_id, 'organization');
  } finally { await db.close(); }
});

test('Concurrent root registration does not replace the first workspace or return its identity for another root', async () => {
  const db = await database();
  try {
    const roots = [config('first'), config('second')];
    const results = await Promise.all(roots.map(input => bootstrap.ensure(db, input)));
    assert.equal(new Set(results.map(row => row.id)).size, 2);
    assert.deepEqual(results.map(row => row.path), roots.map(row => row.workspaceRoot));
  } finally { await db.close(); }
});

test('Canonical storage matches the trusted caller exact lookup for equivalent path spellings', async () => {
  const db = await database();
  try {
    const input = config('canonical');
    input.workspaceRoot = path.dirname(input.workspaceRoot) + '/intermediate/../canonical';
    const canonical = path.resolve(input.workspaceRoot);
    const created = await bootstrap.ensure(db, input);
    assert.equal(created.path, canonical);
    await db.run('UPDATE workspaces SET path=? WHERE id=?', input.workspaceRoot, created.id);
    const restored = await bootstrap.ensure(db, input);
    assert.equal(restored.id, created.id);
    assert.equal((await db.get('SELECT id FROM workspaces WHERE path=?', canonical)).id, created.id);
  } finally { await db.close(); }
});
