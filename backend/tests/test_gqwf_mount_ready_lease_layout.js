'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const portableCopy = require('../src/services/gqwf/materialization/portableCopy');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-lease-layout-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'layout-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'source.txt'), 'source');
  const db = await open({ filename: path.join(root, 'state.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT
    );`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'ws-layout', workspacePath);
  await migrateGqwf(db);
  return { parent, root, workspacePath, db };
}

function observedDriver(events) {
  return {
    ...portableCopy,
    id: 'mount-ready-test-v1',
    materialize: async (input) => {
      events.push({ method: 'materialize', input });
      return portableCopy.materialize(input);
    },
    capture: async (input) => {
      events.push({ method: 'capture', input });
      return portableCopy.capture(input);
    },
    release: async (input) => {
      events.push({ method: 'release', input });
      return portableCopy.release(input);
    }
  };
}

async function verifySeparatedLayout(state) {
  const events = [];
  const driver = observedDriver(events);
  const fabric = createFabric(state.db, {
    materializers: [driver], materializerId: driver.id, requirePortable: false
  });
  const base = await fabric.importBase({ workspaceId: 'ws-layout' });
  const lease = await fabric.materializeRoot({ workspaceId: 'ws-layout', rootHash: base.rootHash });
  assert.equal(path.basename(lease.path), 'root');
  assert.equal(path.dirname(lease.path), lease.containerPath);
  assert.equal(await fs.readFile(path.join(lease.containerPath, '.genos-gqwf-lease'), 'utf8'),
    lease.leaseId);
  await assert.rejects(fs.stat(path.join(lease.path, '.genos-gqwf-lease')), { code: 'ENOENT' });
  const row = await state.db.get('SELECT path, execution_path FROM gqwf_leases WHERE id = ?',
    lease.leaseId);
  assert.equal(row.path, lease.containerPath);
  assert.equal(row.execution_path, lease.path);
  assert.equal(events[0].input.containerPath, lease.containerPath);
  assert.equal(events[0].input.destination, lease.path);

  await fs.writeFile(path.join(lease.path, 'result.txt'), 'candidate');
  const captured = await fabric.ingestLease({ workspaceId: 'ws-layout', leaseId: lease.leaseId });
  assert.equal(events[1].input.containerPath, lease.containerPath);
  assert.equal(events[1].input.sourcePath, lease.path);
  const view = await fabric.createView({ workspaceId: 'ws-layout', baseHash: captured.rootHash });
  assert.equal((await fabric.readFile({
    workspaceId: 'ws-layout', viewId: view.id, path: 'result.txt'
  })).toString(), 'candidate');
  await assert.rejects(fabric.readFile({
    workspaceId: 'ws-layout', viewId: view.id, path: '.genos-gqwf-lease'
  }), /not found/);

  await fabric.releaseLease({ workspaceId: 'ws-layout', leaseId: lease.leaseId });
  assert.equal(events[2].input.path, lease.containerPath);
  assert.equal(events[2].input.executionPath, lease.path);
  await assert.rejects(fs.stat(lease.containerPath), { code: 'ENOENT' });
  return base;
}

async function verifyExecutionPathConfinement(state, base) {
  const fabric = createFabric(state.db);
  const lease = await fabric.materializeRoot({ workspaceId: 'ws-layout', rootHash: base.rootHash });
  const outside = path.join(state.root, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep.txt'), 'safe');
  await state.db.run('UPDATE gqwf_leases SET execution_path = ? WHERE id = ?',
    outside, lease.leaseId);
  await assert.rejects(fabric.ingestLease({ workspaceId: 'ws-layout', leaseId: lease.leaseId }),
    /execution path is outside/);
  assert.equal(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8'), 'safe');
  await state.db.run('UPDATE gqwf_leases SET execution_path = ? WHERE id = ?',
    lease.path, lease.leaseId);
  await fabric.releaseLease({ workspaceId: 'ws-layout', leaseId: lease.leaseId });
}

async function verifyMaterializerPathContract(state, base) {
  const invalid = {
    ...portableCopy,
    id: 'invalid-layout-test-v1',
    materialize: async (input) => {
      await portableCopy.materialize(input);
      return { path: state.root };
    }
  };
  const fabric = createFabric(state.db, {
    materializers: [invalid], materializerId: invalid.id, requirePortable: false
  });
  await assert.rejects(fabric.materializeRoot({
    workspaceId: 'ws-layout', rootHash: base.rootHash
  }), /returned an invalid execution path/);
  const row = await state.db.get(`SELECT leases.status FROM gqwf_leases leases
    JOIN gqwf_materialization_receipts receipts ON receipts.lease_id = leases.id
    WHERE receipts.backend_id = ?`, invalid.id);
  assert.equal(row.status, 'released');
}

async function verifyLegacyLayout(state, base) {
  const id = 'legacy-layout';
  const container = path.join(state.workspacePath, '.genos', 'gqwf', 'materialized', `lease-${id}`);
  await fs.mkdir(container, { recursive: true });
  await fs.writeFile(path.join(container, '.genos-gqwf-lease'), id);
  await state.db.run(`INSERT INTO gqwf_leases
    (id, workspace_id, root_hash, path, execution_path, status)
    VALUES (?, 'ws-layout', ?, ?, NULL, 'open')`, id, base.rootHash, container);
  await createFabric(state.db).releaseLease({ workspaceId: 'ws-layout', leaseId: id });
  const receipt = await createFabric(state.db).inspectMaterialization({
    workspaceId: 'ws-layout', leaseId: id
  });
  assert.equal(receipt.selectionReason, 'legacy_portable_compatibility');
  await assert.rejects(fs.stat(container), { code: 'ENOENT' });
}

async function main() {
  const state = await fixture();
  try {
    const base = await verifySeparatedLayout(state);
    await verifyExecutionPathConfinement(state, base);
    await verifyMaterializerPathContract(state, base);
    await verifyLegacyLayout(state, base);
    console.log('GQWF mount-ready lease layout checks passed.');
  } finally {
    await state.db.close();
    if (path.dirname(state.root) !== state.parent || !path.basename(state.root).startsWith('layout-')) {
      throw new Error('Refusing to remove an unmanaged GQWF lease layout fixture.');
    }
    await fs.rm(state.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
