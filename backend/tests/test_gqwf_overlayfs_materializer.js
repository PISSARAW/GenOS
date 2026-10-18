'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const overlayfs = require('../src/services/gqwf/materialization/overlayfs');
const portableCopy = require('../src/services/gqwf/materialization/portableCopy');
const reflink = require('../src/services/gqwf/materialization/reflink');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-overlayfs-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'overlayfs-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'source.txt'), 'source');
  const db = await open({ filename: path.join(root, 'state.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT
    );`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'ws-overlayfs', workspacePath);
  await migrateGqwf(db);
  return { parent, root, workspacePath, db };
}

function emulatedRuntime(events) {
  const mounted = new Set();
  const failures = new Set();
  return {
    platform: 'linux',
    mount: async (input) => {
      events.push({ method: 'mount', ...input });
      await fs.cp(input.lower, input.merged, { recursive: true, force: false });
      mounted.add(input.merged);
    },
    unmount: async (target) => {
      events.push({ method: 'unmount', target });
      if (failures.delete(target)) {
        const error = new Error('injected busy mount');
        error.code = 'EBUSY';
        throw error;
      }
      mounted.delete(target);
    },
    isMounted: async (target) => mounted.has(target),
    failUnmountOnce: (target) => failures.add(target)
  };
}

function fabricFor(state, runtime, materializerId = overlayfs.id) {
  const driver = overlayfs.createOverlayfsMaterializer(runtime);
  return createFabric(state.db, {
    materializers: [portableCopy, driver], materializerId
  });
}

function leaseMounts(events) {
  return events.filter((event) => event.method === 'mount'
    && event.merged.includes(`${path.sep}materialized${path.sep}`));
}

async function inspectHost(state) {
  const inspected = await createFabric(state.db).inspectMaterializers({
    workspaceId: 'ws-overlayfs'
  });
  const capability = inspected.find((entry) => entry.backendId === overlayfs.id);
  assert.ok(capability);
  assert.equal(capability.materialization, 'lazy');
  assert.equal(capability.copyGranularity, 'file');
  assert.equal(capability.requiresMount, true);
  assert.equal(capability.portable, false);
  if (process.platform !== 'linux') {
    assert.equal(capability.available, false);
    assert.equal(capability.unavailableReason, `overlayfs_platform_${process.platform}`);
  }
  return capability;
}

async function verifySharedLowerAndIsolation(state, base) {
  const events = [];
  const runtime = emulatedRuntime(events);
  const fabric = fabricFor(state, runtime);
  const first = await fabric.materializeRoot({ workspaceId: 'ws-overlayfs',
    rootHash: base.rootHash });
  const second = await fabric.materializeRoot({ workspaceId: 'ws-overlayfs',
    rootHash: base.rootHash });
  await fs.writeFile(path.join(first.path, 'source.txt'), 'first');
  assert.equal(await fs.readFile(path.join(second.path, 'source.txt'), 'utf8'), 'source');
  const mounts = leaseMounts(events);
  assert.equal(mounts.length, 2);
  assert.equal(mounts[0].lower, mounts[1].lower);
  assert.notEqual(mounts[0].upper, mounts[1].upper);
  assert.equal(path.dirname(mounts[0].upper), first.containerPath);
  assert.equal(path.dirname(mounts[0].work), first.containerPath);
  assert.equal(first.materialization.backendId, overlayfs.id);
  assert.equal(first.materialization.selectionReason, 'explicit_backend');
  const captured = await fabric.ingestLease({ workspaceId: 'ws-overlayfs',
    leaseId: first.leaseId });
  const portable = createFabric(state.db);
  const view = await portable.createView({ workspaceId: 'ws-overlayfs',
    baseHash: captured.rootHash });
  assert.equal((await portable.readFile({ workspaceId: 'ws-overlayfs', viewId: view.id,
    path: 'source.txt' })).toString(), 'first');
  await fabric.releaseLease({ workspaceId: 'ws-overlayfs', leaseId: first.leaseId });
  await fabric.releaseLease({ workspaceId: 'ws-overlayfs', leaseId: second.leaseId });
  return { runtime, fabric, lower: mounts[0].lower };
}

async function verifyFailClosedUnmount(state, base) {
  const events = [];
  const runtime = emulatedRuntime(events);
  const fabric = fabricFor(state, runtime);
  const lease = await fabric.materializeRoot({ workspaceId: 'ws-overlayfs',
    rootHash: base.rootHash });
  runtime.failUnmountOnce(lease.path);
  await assert.rejects(fabric.releaseLease({ workspaceId: 'ws-overlayfs',
    leaseId: lease.leaseId }), /injected busy mount/);
  assert.equal((await state.db.get('SELECT status FROM gqwf_leases WHERE id = ?',
    lease.leaseId)).status, 'releasing');
  assert.equal((await fs.stat(lease.containerPath)).isDirectory(), true);
  await fabric.releaseLease({ workspaceId: 'ws-overlayfs', leaseId: lease.leaseId });
  await assert.rejects(fs.stat(lease.containerPath), { code: 'ENOENT' });
}

function unavailableReflink() {
  return reflink.createReflinkMaterializer({ copyFile: async () => {
    const error = new Error('unsupported');
    error.code = 'ENOTSUP';
    throw error;
  } });
}

async function verifyAutoOrder(state, base) {
  const events = [];
  const driver = overlayfs.createOverlayfsMaterializer(emulatedRuntime(events));
  const preferred = createFabric(state.db, { materializers: [portableCopy,
    unavailableReflink(), driver], materializerId: 'auto' });
  const lease = await preferred.materializeRoot({ workspaceId: 'ws-overlayfs',
    rootHash: base.rootHash });
  assert.equal(lease.materialization.backendId, overlayfs.id);
  assert.equal(lease.materialization.selectionReason, 'auto_overlayfs');
  await preferred.releaseLease({ workspaceId: 'ws-overlayfs', leaseId: lease.leaseId });

  const fallback = createFabric(state.db, { materializers: [portableCopy,
    unavailableReflink()], materializerId: 'auto' });
  const portable = await fallback.materializeRoot({ workspaceId: 'ws-overlayfs',
    rootHash: base.rootHash });
  assert.equal(portable.materialization.backendId, portableCopy.id);
  assert.match(portable.materialization.selectionReason,
    /linux-overlayfs-v1=backend_unregistered/);
  assert.match(portable.materialization.selectionReason,
    /native-reflink-v1=reflink_probe_enotsup/);
  await fallback.releaseLease({ workspaceId: 'ws-overlayfs', leaseId: portable.leaseId });
}

async function verifyCorruptLowerRefused(state, base, lower) {
  await fs.writeFile(path.join(lower, 'source.txt'), 'corrupt');
  const before = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  const fabric = fabricFor(state, emulatedRuntime([]));
  await assert.rejects(fabric.materializeRoot({ workspaceId: 'ws-overlayfs',
    rootHash: base.rootHash }), /lower cache integrity/);
  const after = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  assert.equal(after.count, before.count + 1);
  const row = await state.db.get('SELECT status FROM gqwf_leases ORDER BY rowid DESC LIMIT 1');
  assert.equal(row.status, 'released');
}

async function verifyExplicitHostBehavior(state, base, capability) {
  if (capability.available) return;
  const before = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  await assert.rejects(createFabric(state.db, { materializerId: overlayfs.id })
    .materializeRoot({ workspaceId: 'ws-overlayfs', rootHash: base.rootHash }),
  /is unavailable/);
  const after = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  assert.equal(after.count, before.count);
}

async function main() {
  const state = await fixture();
  try {
    const capability = await inspectHost(state);
    const base = await createFabric(state.db).importBase({ workspaceId: 'ws-overlayfs' });
    const shared = await verifySharedLowerAndIsolation(state, base);
    await verifyFailClosedUnmount(state, base);
    await verifyAutoOrder(state, base);
    await verifyExplicitHostBehavior(state, base, capability);
    await verifyCorruptLowerRefused(state, base, shared.lower);
    console.log(`GQWF OverlayFS materializer: PASS (${capability.available
      ? 'available' : capability.unavailableReason})`);
  } finally {
    await state.db.close();
    if (path.dirname(state.root) !== state.parent
      || !path.basename(state.root).startsWith('overlayfs-')) {
      throw new Error('Refusing to remove an unmanaged GQWF OverlayFS fixture.');
    }
    await fs.rm(state.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
