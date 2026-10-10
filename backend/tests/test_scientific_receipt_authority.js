'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { MathematicalDependencyGraph, LeanIncrementalGate } = require('../src/services/epistemicScheduler');
const { globalRegistry } = require('../src/services/mathematical/verificationRegistry');
const { createScientificReceiptAuthority } = require('../src/services/scientificReceiptAuthority');
const { ensureTables, createScientificReferenceStore } = require('../src/services/scientificReferences');

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const scope = { organizationId: 'org', projectId: 'project', workspaceId: 'w1' };
const ref = { ...scope, objectType: 'theorem', objectId: 'theorem-1', version: 1 };
const source = 'theorem theorem_1 : 0 = 0 := by rfl';
const toolchainVersion = 'lean-test';
const environmentDigest = hash('environment');

async function expectCode(task, code) {
  await assert.rejects(task, (error) => error.code === code);
}

function executor(counter) {
  return async () => {
    counter.calls++;
    return { exitCode: 0, toolchainVersion, axioms: [] };
  };
}

async function createReceipt() {
  const graph = new MathematicalDependencyGraph();
  graph.addNode({ nodeId: ref.objectId, type: 'theorem', canonicalStatement: '0 = 0',
    status: 'formalized' });
  const gate = new LeanIncrementalGate({ graph, environmentDigest, toolchainVersion,
    executor: async () => ({ exitCode: 0, toolchainVersion, axioms: [] }) });
  return gate.verifyNode({ nodeId: ref.objectId, source });
}

function reference(receipt) {
  return { ...ref, contentDigest: hash(source), sourceDigest: receipt.sourceDigest,
    canonicalStatement: '0 = 0', formalStatementDigest: receipt.formalStatementDigest,
    environmentDigest, assumptions: [], validityDomain: 'equality', dependencies: [] };
}

async function openDatabase(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces
    (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT OR IGNORE INTO workspaces VALUES ('w1', 'org', 'project');`);
  await ensureTables(db);
  return db;
}

function authority(db, check) {
  return createScientificReceiptAuthority({ db, toolchainVersion, environmentDigest,
    executor: check });
}

async function run() {
  const filename = path.join(os.tmpdir(), `genos-scientific-receipt-${process.pid}-${Date.now()}.db`);
  let db;
  try {
    db = await openDatabase(filename);
    const receipt = await createReceipt();
    const calls = { calls: 0 };
    const initial = authority(db, executor(calls));
    await initial.attest({ receipt, ref, source, canonicalStatement: '0 = 0' });
    assert.equal(calls.calls, 1);
    const store = createScientificReferenceStore({ verifyReceipt: initial.verifyReceipt });
    await store.publishVerified(db, { reference: reference(receipt),
      contentBytes: Buffer.from(source), receiptDigest: receipt.receiptDigest });
    assert.equal(calls.calls, 1, 'same-process attestation can reuse its verified record');
    await db.close();
    db = null;

    globalRegistry.clear();
    db = await openDatabase(filename);
    const untrusted = createScientificReferenceStore({ verifyReceipt: async () => ({ receipt, ref }) });
    await expectCode(() => untrusted.resolveReference(db, { ref, requesterScope: scope }),
      'SCI_REF_RECEIPT_REJECTED');
    const failReplay = authority(db, async () => ({ exitCode: 1,
      toolchainVersion, axioms: [] }));
    const unavailable = createScientificReferenceStore({ verifyReceipt: failReplay.verifyReceipt });
    await expectCode(() => unavailable.resolveReference(db, { ref, requesterScope: scope }),
      'SCI_RECEIPT_REPLAY_FAILED');

    const restored = authority(db, executor(calls));
    const resumed = createScientificReferenceStore({ verifyReceipt: restored.verifyReceipt });
    const resolved = await resumed.resolveReference(db, { ref, requesterScope: scope });
    assert.equal(resolved.content, source);
    assert.equal(calls.calls, 2, 'new authority must replay after restart');
    await resumed.resolveReference(db, { ref, requesterScope: scope });
    assert.equal(calls.calls, 2, 'unchanged persisted record is cached within an instance');

    const otherRef = { ...ref, version: 2 };
    assert.equal(await restored.verifyReceipt(receipt.receiptDigest, otherRef), null);
    await db.run(`UPDATE scientific_receipt_authority SET source_bytes = ?
      WHERE receipt_digest = ?`, Buffer.from('theorem fake : 0 = 0 := by rfl'), receipt.receiptDigest);
    await expectCode(() => resumed.resolveReference(db, { ref, requesterScope: scope }),
      'SCI_RECEIPT_INTEGRITY');
    console.log('Scientific receipt authority: Lean replay, restart and tamper checks passed.');
  } finally {
    if (db) await db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      await fs.unlink(`${filename}${suffix}`).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    globalRegistry.clear();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
