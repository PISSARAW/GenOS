'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-execution-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'execution-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'shared.txt'), 'base');
  const db = await open({ filename: path.join(root, 'state.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT
    );`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'ws-execution', workspacePath);
  await migrateGqwf(db);
  return { parent, root, workspacePath, db };
}

async function verifyLazyIsolation(context) {
  const fabric = createFabric(context.db);
  const base = await fabric.importBase({ workspaceId: 'ws-execution' });
  const first = await fabric.openExecutionWorkspace({
    workspaceId: 'ws-execution', baseHash: base.rootHash
  });
  const second = await fabric.openExecutionWorkspace({
    workspaceId: 'ws-execution', baseHash: base.rootHash
  });
  assert.equal(first.materialized, false);
  assert.equal(first.path, null);
  assert.equal(second.materialized, false);
  await assert.rejects(fs.stat(path.join(context.workspacePath, '.genos', 'gqwf', 'materialized')), { code: 'ENOENT' });

  const version = await fabric.writeFile({
    workspaceId: first.workspaceId, viewId: first.viewId,
    path: 'shared.txt', content: 'first', expectedVersion: first.version
  });
  assert.equal((await fabric.readFile({
    workspaceId: second.workspaceId, viewId: second.viewId, path: 'shared.txt'
  })).toString(), 'base');
  return { fabric, base, first, version };
}

async function verifyMaterialization(context, state) {
  const materialized = await state.fabric.materializeExecutionWorkspace({
    workspaceId: state.first.workspaceId,
    baseHash: state.base.rootHash,
    viewId: state.first.viewId,
    expectedVersion: state.version
  });
  assert.equal(materialized.materialized, true);
  assert.equal(await fs.readFile(path.join(materialized.path, 'shared.txt'), 'utf8'), 'first');
  await fs.writeFile(path.join(materialized.path, 'generated.txt'), 'command output');
  const ingested = await state.fabric.ingestExecutionWorkspace({
    workspaceId: materialized.workspaceId, leaseId: materialized.leaseId
  });
  assert.notEqual(ingested.candidateHash, materialized.candidateHash);
  const candidate = await state.fabric.createView({
    workspaceId: materialized.workspaceId, baseHash: ingested.candidateHash
  });
  assert.equal((await state.fabric.readFile({
    workspaceId: materialized.workspaceId,
    viewId: candidate.id,
    path: 'generated.txt'
  })).toString(), 'command output');
  const released = await state.fabric.releaseExecutionWorkspace({
    workspaceId: materialized.workspaceId, leaseId: materialized.leaseId
  });
  assert.equal(released.state, 'released');
  await assert.rejects(fs.stat(materialized.path), { code: 'ENOENT' });
}

async function main() {
  const context = await fixture();
  try {
    const state = await verifyLazyIsolation(context);
    await assert.rejects(state.fabric.materializeExecutionWorkspace({
      workspaceId: state.first.workspaceId,
      baseHash: state.base.rootHash,
      viewId: state.first.viewId,
      expectedVersion: 0
    }), /version conflict/);
    await verifyMaterialization(context, state);
    console.log('GQWF lazy execution workspace checks passed.');
  } finally {
    await context.db.close();
    if (path.dirname(context.root) !== context.parent || !path.basename(context.root).startsWith('execution-')) {
      throw new Error('Refusing to remove an unmanaged GQWF execution fixture.');
    }
    await fs.rm(context.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
