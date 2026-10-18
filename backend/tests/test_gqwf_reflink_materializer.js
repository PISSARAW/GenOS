'use strict';

const assert = require('node:assert/strict');
const nativeFs = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const { readBlob, sha256 } = require('../src/services/gqwf/objects');
const portableCopy = require('../src/services/gqwf/materialization/portableCopy');
const reflink = require('../src/services/gqwf/materialization/reflink');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-reflink-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'reflink-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'source.txt'), 'source');
  const db = await open({ filename: path.join(root, 'state.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT
    );`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'ws-reflink', workspacePath);
  await migrateGqwf(db);
  return { parent, root, workspacePath, db };
}

function emulatedDriver(calls) {
  return reflink.createReflinkMaterializer({
    copyFile: async (source, target, flags) => {
      calls.push({ source, target, flags });
      await fs.copyFile(source, target, nativeFs.constants.COPYFILE_EXCL);
    }
  });
}

function unavailableDriver() {
  return reflink.createReflinkMaterializer({
    copyFile: async () => {
      const error = new Error('clone unsupported by injected filesystem');
      error.code = 'ENOTSUP';
      throw error;
    }
  });
}

async function inspectHost(state) {
  const inspected = await createFabric(state.db).inspectMaterializers({
    workspaceId: 'ws-reflink'
  });
  const native = inspected.find((entry) => entry.backendId === 'native-reflink-v1');
  assert.ok(native);
  assert.equal(native.copyGranularity, 'file');
  assert.equal(native.portable, false);
  assert.equal(native.requiresMount, false);
  return native;
}

async function materializeCandidate(fabric, rootHash) {
  const lease = await fabric.materializeRoot({ workspaceId: 'ws-reflink', rootHash });
  assert.equal(await fs.readFile(path.join(lease.path, 'source.txt'), 'utf8'), 'source');
  await fs.writeFile(path.join(lease.path, 'source.txt'), 'changed');
  await fs.writeFile(path.join(lease.path, 'result.txt'), 'same-result');
  const captured = await fabric.ingestLease({
    workspaceId: 'ws-reflink', leaseId: lease.leaseId
  });
  return { lease, captured };
}

async function verifyParityAndIsolation(state, base) {
  const calls = [];
  const driver = emulatedDriver(calls);
  const portable = createFabric(state.db);
  const native = createFabric(state.db, {
    materializers: [portableCopy, driver],
    materializerId: driver.id
  });
  const portableCandidate = await materializeCandidate(portable, base.rootHash);
  const nativeCandidate = await materializeCandidate(native, base.rootHash);
  assert.equal(nativeCandidate.captured.rootHash, portableCandidate.captured.rootHash);
  assert.equal((await readBlob(state.workspacePath, sha256(Buffer.from('source')))).toString(), 'source');
  assert.ok(calls.length >= 3);
  assert.ok(calls.every((entry) => entry.flags === reflink.CLONE_FLAGS));
  const receipt = await native.inspectMaterialization({
    workspaceId: 'ws-reflink', leaseId: nativeCandidate.lease.leaseId
  });
  assert.equal(receipt.backendId, driver.id);
  assert.equal(receipt.selectionReason, 'explicit_backend');
  await portable.releaseLease({
    workspaceId: 'ws-reflink', leaseId: portableCandidate.lease.leaseId
  });
  await native.releaseLease({
    workspaceId: 'ws-reflink', leaseId: nativeCandidate.lease.leaseId
  });
}

async function verifyAutoPolicy(state, rootHash) {
  const fallback = createFabric(state.db, {
    materializers: [portableCopy, unavailableDriver()],
    materializerId: 'auto'
  });
  const portableLease = await fallback.materializeRoot({ workspaceId: 'ws-reflink', rootHash });
  assert.equal(portableLease.materialization.backendId, portableCopy.id);
  assert.equal(portableLease.materialization.selectionReason,
    'auto_portable_fallback:reflink_probe_enotsup');
  await fallback.releaseLease({ workspaceId: 'ws-reflink', leaseId: portableLease.leaseId });

  const native = emulatedDriver([]);
  const preferred = createFabric(state.db, {
    materializers: [portableCopy, native], materializerId: 'auto'
  });
  const nativeLease = await preferred.materializeRoot({ workspaceId: 'ws-reflink', rootHash });
  assert.equal(nativeLease.materialization.backendId, native.id);
  assert.equal(nativeLease.materialization.selectionReason, 'auto_reflink');
  await preferred.releaseLease({ workspaceId: 'ws-reflink', leaseId: nativeLease.leaseId });
}

async function verifyExplicitHostBehavior(state, rootHash, capability) {
  const before = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  const fabric = createFabric(state.db, { materializerId: reflink.id });
  if (!capability.available) {
    await assert.rejects(fabric.materializeRoot({ workspaceId: 'ws-reflink', rootHash }),
      /is unavailable/);
    const after = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
    assert.equal(after.count, before.count);
    return;
  }
  const candidate = await materializeCandidate(fabric, rootHash);
  assert.equal(candidate.lease.materialization.backendId, reflink.id);
  await fabric.releaseLease({ workspaceId: 'ws-reflink', leaseId: candidate.lease.leaseId });
}

async function main() {
  const state = await fixture();
  try {
    const capability = await inspectHost(state);
    const base = await createFabric(state.db).importBase({ workspaceId: 'ws-reflink' });
    await verifyParityAndIsolation(state, base);
    await verifyAutoPolicy(state, base.rootHash);
    await verifyExplicitHostBehavior(state, base.rootHash, capability);
    console.log(`GQWF native reflink materializer: PASS (${capability.available ? 'available' : capability.unavailableReason})`);
  } finally {
    await state.db.close();
    if (path.dirname(state.root) !== state.parent || !path.basename(state.root).startsWith('reflink-')) {
      throw new Error('Refusing to remove an unmanaged GQWF reflink fixture.');
    }
    await fs.rm(state.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
