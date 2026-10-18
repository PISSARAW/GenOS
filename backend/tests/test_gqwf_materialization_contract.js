'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const materializerContract = require('../src/services/gqwf/materialization/contract');
const portableCopy = require('../src/services/gqwf/materialization/portableCopy');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-materializer-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'materializer-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'source.txt'), 'source');
  const db = await open({ filename: path.join(root, 'state.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT
    );`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'ws-materializer', workspacePath);
  await migrateGqwf(db);
  return { parent, root, workspacePath, db };
}

function aliasMaterializer() {
  return { ...portableCopy, id: 'portable-alias-test-v1' };
}

function aliasFabric(db) {
  return createFabric(db, {
    materializers: [aliasMaterializer()],
    materializerId: 'portable-alias-test-v1',
    requirePortable: false
  });
}

async function verifyCapabilities(state) {
  const capabilities = await createFabric(state.db).inspectMaterializers({
    workspaceId: 'ws-materializer'
  });
  assert.equal(capabilities.length, 2);
  const portable = capabilities.find((entry) => entry.backendId === 'portable-copy-v1');
  assert.deepEqual(portable, {
    backendId: 'portable-copy-v1',
    contractVersion: 1,
    available: true,
    unavailableReason: null,
    platform: process.platform,
    materialization: 'eager',
    copyGranularity: 'none',
    requiresMount: false,
    portable: true,
    supportsCapture: true,
    supportsRecovery: true
  });
  const native = capabilities.find((entry) => entry.backendId === 'native-reflink-v1');
  assert.equal(native.copyGranularity, 'file');
  assert.equal(native.portable, false);
  assert.equal(typeof native.available, 'boolean');
}

async function materializeCandidate(fabric, rootHash, content) {
  const lease = await fabric.materializeRoot({
    workspaceId: 'ws-materializer', rootHash
  });
  assert.match(lease.materialization.receiptHash, /^[a-f0-9]{64}$/);
  assert.equal(await fs.readFile(path.join(lease.path, 'source.txt'), 'utf8'), 'source');
  await fs.writeFile(path.join(lease.path, 'result.txt'), content);
  const captured = await fabric.ingestLease({
    workspaceId: 'ws-materializer', leaseId: lease.leaseId
  });
  return { lease, captured };
}

async function verifyBackendParity(state) {
  const portable = createFabric(state.db);
  const alias = aliasFabric(state.db);
  const base = await portable.importBase({ workspaceId: 'ws-materializer' });
  const first = await materializeCandidate(portable, base.rootHash, 'same-result');
  const second = await materializeCandidate(alias, base.rootHash, 'same-result');
  assert.equal(first.captured.rootHash, second.captured.rootHash);

  const portableReceipt = await portable.inspectMaterialization({
    workspaceId: 'ws-materializer', leaseId: first.lease.leaseId
  });
  const aliasReceipt = await alias.inspectMaterialization({
    workspaceId: 'ws-materializer', leaseId: second.lease.leaseId
  });
  assert.equal(portableReceipt.backendId, 'portable-copy-v1');
  assert.equal(portableReceipt.selectionReason, 'default_portable');
  assert.equal(aliasReceipt.backendId, 'portable-alias-test-v1');
  assert.equal(aliasReceipt.selectionReason, 'explicit_backend');
  await portable.releaseLease({ workspaceId: 'ws-materializer', leaseId: first.lease.leaseId });
  await alias.releaseLease({ workspaceId: 'ws-materializer', leaseId: second.lease.leaseId });
  return { base, portableReceipt };
}

async function verifyFailClosedSelection(state, rootHash) {
  const before = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  const unavailable = { ...portableCopy, id: 'unavailable-test-v1',
    probe: async () => ({ ...await portableCopy.probe(), available: false,
      unavailableReason: 'injected_test' }) };
  const fabric = createFabric(state.db, { materializers: [unavailable],
    materializerId: unavailable.id, requirePortable: false });
  await assert.rejects(fabric.materializeRoot({
    workspaceId: 'ws-materializer', rootHash
  }), /is unavailable/);
  const after = await state.db.get('SELECT COUNT(*) AS count FROM gqwf_leases');
  assert.equal(after.count, before.count);

  const malformed = { id: 'malformed-test-v1', contractVersion: 1, probe: async () => ({}) };
  await assert.rejects(createFabric(state.db, { materializers: [malformed],
    materializerId: malformed.id, requirePortable: false }).inspectMaterializers(),
  /missing 'materialize'/);
}

async function verifyLegacyRecovery(state, rootHash) {
  const id = 'legacy-materializer';
  const leasePath = path.join(state.workspacePath, '.genos', 'gqwf', 'materialized', `lease-${id}`);
  await fs.mkdir(leasePath, { recursive: true });
  await fs.writeFile(path.join(leasePath, '.genos-gqwf-lease'), id);
  await state.db.run(`INSERT INTO gqwf_leases
    (id, workspace_id, root_hash, path, status) VALUES (?, ?, ?, ?, 'releasing')`,
  id, 'ws-materializer', rootHash, leasePath);
  const fabric = createFabric(state.db);
  assert.deepEqual(await fabric.reconcileReleasingLeases({ workspaceId: 'ws-materializer' }),
    { reconciled: 1, quarantined: 0 });
  const receipt = await fabric.inspectMaterialization({
    workspaceId: 'ws-materializer', leaseId: id
  });
  assert.equal(receipt.backendId, 'portable-copy-v1');
  assert.equal(receipt.selectionReason, 'legacy_portable_compatibility');
  await assert.rejects(fs.stat(leasePath), { code: 'ENOENT' });
}

async function verifyReceiptIntegrity(state, receipt) {
  await state.db.run(`UPDATE gqwf_materialization_receipts
    SET capabilities_json = ? WHERE lease_id = ?`, '{}', receipt.leaseId);
  await assert.rejects(createFabric(state.db).inspectMaterialization({
    workspaceId: 'ws-materializer', leaseId: receipt.leaseId
  }), /capability receipt is corrupt/);
}

async function verifyReceiptBinding(state, rootHash) {
  const fabric = createFabric(state.db);
  const lease = await fabric.materializeRoot({
    workspaceId: 'ws-materializer', rootHash
  });
  const row = await state.db.get(`SELECT * FROM gqwf_materialization_receipts
    WHERE lease_id = ?`, lease.leaseId);
  const alteredRoot = '0'.repeat(64);
  const alteredHash = materializerContract.digest({
    version: 1, leaseId: lease.leaseId, workspaceId: 'ws-materializer',
    rootHash: alteredRoot, backendId: row.backend_id,
    contractVersion: row.contract_version, capabilityHash: row.capability_hash,
    selectionReason: row.selection_reason
  });
  await state.db.run(`UPDATE gqwf_materialization_receipts
    SET root_hash = ?, receipt_hash = ? WHERE lease_id = ?`,
  alteredRoot, alteredHash, lease.leaseId);
  await assert.rejects(fabric.releaseLease({
    workspaceId: 'ws-materializer', leaseId: lease.leaseId
  }), /not bound to this lease root/);
  await state.db.run(`UPDATE gqwf_materialization_receipts
    SET root_hash = ?, receipt_hash = ? WHERE lease_id = ?`,
  rootHash, lease.materialization.receiptHash, lease.leaseId);
  await fabric.releaseLease({ workspaceId: 'ws-materializer', leaseId: lease.leaseId });
}

async function main() {
  const state = await fixture();
  try {
    await verifyCapabilities(state);
    const verified = await verifyBackendParity(state);
    await verifyFailClosedSelection(state, verified.base.rootHash);
    await verifyLegacyRecovery(state, verified.base.rootHash);
    await verifyReceiptIntegrity(state, verified.portableReceipt);
    await verifyReceiptBinding(state, verified.base.rootHash);
    console.log('GQWF materialization SPI and conformance checks passed.');
  } finally {
    await state.db.close();
    if (path.dirname(state.root) !== state.parent
      || !path.basename(state.root).startsWith('materializer-')) {
      throw new Error('Refusing to remove an unmanaged GQWF materializer fixture.');
    }
    await fs.rm(state.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
