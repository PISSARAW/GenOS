'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { MathematicalDependencyGraph, LeanIncrementalGate } = require('../src/services/epistemicScheduler');
const { globalRegistry } = require('../src/services/mathematical/verificationRegistry');
const { ensureTables, createScientificReferenceStore, formatReference, parseReference } =
  require('../src/services/scientificReferences');

const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function expectCode(task, code) {
  await assert.rejects(task, (error) => error.code === code);
}

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('w1', 'org', 'project');`);
  await ensureTables(db);
  const graph = new MathematicalDependencyGraph();
  graph.addNode({ nodeId: 'theorem-1', type: 'theorem', canonicalStatement: '0 = 0', status: 'formalized' });
  const gate = new LeanIncrementalGate({ graph, environmentDigest: hash('environment'),
    toolchainVersion: 'lean-test', executor: async () => ({ exitCode: 0,
      toolchainVersion: 'lean-test', axioms: [] }) });
  const source = 'theorem theorem_1 : 0 = 0 := by rfl';
  const receipt = await gate.verifyNode({ nodeId: 'theorem-1', source });
  assert.equal(receipt.status, 'passed');
  const ref = { organizationId: 'org', projectId: 'project', workspaceId: 'w1',
    objectType: 'theorem', objectId: 'theorem-1', version: 1 };
  const bytes = Buffer.from(source, 'utf8');
  const reference = { ...ref, contentDigest: hash(bytes), sourceDigest: receipt.sourceDigest,
    canonicalStatement: '0 = 0', formalStatementDigest: receipt.formalStatementDigest,
    environmentDigest: receipt.environmentDigest, assumptions: [],
    validityDomain: 'natural-number equality', dependencies: [] };
  const verified = new Map([[`${receipt.receiptDigest}|${formatReference(ref)}`,
    { receipt, ref }]]);
  const retractions = new Map();
  const store = createScientificReferenceStore({
    verifyReceipt: async (id, requestedRef) => verified.get(`${id}|${formatReference(requestedRef)}`) || null,
    verifyRetractionReceipt: async (id) => retractions.get(id) || null,
  });
  return { db, store, ref, bytes, reference, receipt, verified, retractions, gate, graph };
}

async function run() {
  const f = await fixture();
  try {
    const scope = { organizationId: 'org', projectId: 'project', workspaceId: 'w1' };
    const uri = formatReference(f.ref);
    assert.deepEqual(parseReference(uri), f.ref);
    assert.throws(() => formatReference({ ...f.ref, objectId: ' theorem-1 ' }),
      (error) => error.code === 'SCI_REF_INVALID');
    assert.throws(() => parseReference(uri.replace('project', '%70roject')),
      (error) => error.code === 'SCI_REF_INVALID');
    await expectCode(() => f.store.publishVerified(f.db, { reference: { ...f.reference,
      canonicalStatement: 'False' }, contentBytes: f.bytes, receiptDigest: f.receipt.receiptDigest }),
    'SCI_REF_RECEIPT_MISMATCH');
    await expectCode(() => f.store.publishVerified(f.db, { reference: { ...f.reference,
      contentDigest: hash('tampered') }, contentBytes: f.bytes, receiptDigest: f.receipt.receiptDigest }),
    'SCI_REF_CONTENT_MISMATCH');
    const invalidUtf8 = Buffer.from([0xff]);
    await expectCode(() => f.store.publishVerified(f.db, { reference: { ...f.reference,
      contentDigest: hash(invalidUtf8) }, contentBytes: invalidUtf8,
    receiptDigest: f.receipt.receiptDigest }), 'SCI_REF_ENCODING');
    await expectCode(() => f.store.publishVerified(f.db, { reference: { ...f.reference,
      canonicalStatement: 'Natural language', formalStatementDigest: f.receipt.formalStatementDigest },
    contentBytes: f.bytes, receiptDigest: f.receipt.receiptDigest }), 'SCI_REF_RECEIPT_MISMATCH');
    const published = await f.store.publishVerified(f.db, { reference: f.reference,
      contentBytes: f.bytes, receiptDigest: f.receipt.receiptDigest });
    assert.equal(published.uri, uri);
    await expectCode(() => f.store.publishVerified(f.db, { reference: { ...f.reference,
      objectId: 'another-theorem' }, contentBytes: f.bytes,
    receiptDigest: f.receipt.receiptDigest }), 'SCI_REF_PUBLICATION_BINDING');
    await expectCode(() => f.store.publishVerified(f.db, { reference: f.reference,
      contentBytes: f.bytes, receiptDigest: f.receipt.receiptDigest }), 'SQLITE_CONSTRAINT');
    await expectCode(() => f.store.resolveReference(f.db, { ref: uri,
      requesterScope: { ...scope, projectId: 'other' } }), 'SCI_REF_SCOPE_FORBIDDEN');
    const resolved = await f.store.resolveReference(f.db, { ref: uri, requesterScope: scope });
    assert.equal(resolved.content, f.bytes.toString('utf8'));
    assert.equal(resolved.digest, hash(f.bytes));
    f.graph.addNode({ nodeId: 'theorem-2', type: 'theorem',
      canonicalStatement: '1 = 1', status: 'formalized' });
    f.graph.addEdge({ from: 'theorem-1', to: 'theorem-2', type: 'uses' });
    const derivedSource = 'theorem theorem_2 : 1 = 1 := by rfl';
    const derivedReceipt = await f.gate.verifyNode({ nodeId: 'theorem-2', source: derivedSource });
    assert.equal(derivedReceipt.status, 'passed');
    const derivedRef = { ...f.ref, objectId: 'theorem-2' };
    f.verified.set(`${derivedReceipt.receiptDigest}|${formatReference(derivedRef)}`,
      { receipt: derivedReceipt, ref: derivedRef });
    const derivedBytes = Buffer.from(derivedSource);
    const derived = { ...f.reference, ...derivedRef, canonicalStatement: '1 = 1',
      contentDigest: hash(derivedBytes), sourceDigest: derivedReceipt.sourceDigest,
      formalStatementDigest: derivedReceipt.formalStatementDigest,
      dependencies: [{ ...f.ref, receiptDigest: f.receipt.receiptDigest }] };
    await f.store.publishVerified(f.db, { reference: derived,
      contentBytes: derivedBytes, receiptDigest: derivedReceipt.receiptDigest });
    await f.db.run('UPDATE scientific_references SET content_bytes = ? WHERE object_id = ?',
      Buffer.from('tampered'), f.ref.objectId);
    await expectCode(() => f.store.resolveReference(f.db, { ref: uri, requesterScope: scope }), 'SCI_REF_INTEGRITY');
    await f.db.run('UPDATE scientific_references SET content_bytes = ? WHERE object_id = ?', f.bytes, f.ref.objectId);
    f.verified.clear();
    const restarted = createScientificReferenceStore({ verifyReceipt: async (id, ref) =>
      f.verified.get(`${id}|${formatReference(ref)}`) || null });
    await expectCode(() => restarted.resolveReference(f.db, { ref: uri, requesterScope: scope }),
      'SCI_REF_PUBLICATION_BINDING');
    f.verified.set(`${f.receipt.receiptDigest}|${uri}`, { receipt: f.receipt, ref: f.ref });
    f.verified.set(`${derivedReceipt.receiptDigest}|${formatReference(derivedRef)}`,
      { receipt: derivedReceipt, ref: derivedRef });
    const retractionDigest = hash('independent retraction receipt');
    const retractionId = 'retraction-1';
    await expectCode(() => f.store.markStale(f.db, { ref: uri,
      retractionReceiptId: retractionId, retractionReceiptDigest: retractionDigest }),
    'SCI_REF_RETRACTION_REJECTED');
    f.retractions.set(retractionDigest, { status: 'validated', id: retractionId,
      receiptDigest: retractionDigest, ref: f.ref });
    const stale = await f.store.markStale(f.db, { ref: uri,
      retractionReceiptId: retractionId, retractionReceiptDigest: retractionDigest });
    assert.equal(stale.status, 'stale');
    await expectCode(() => f.store.resolveReference(f.db, { ref: uri, requesterScope: scope }), 'SCI_REF_STALE');
    await expectCode(() => f.store.resolveReference(f.db, { ref: derivedRef, requesterScope: scope }),
      'SCI_REF_DEPENDENCY_STALE');
    await expectCode(() => f.store.publishVerified(f.db, { reference: { ...derived, version: 2 },
      contentBytes: derivedBytes, receiptDigest: derivedReceipt.receiptDigest }),
    'SCI_REF_PUBLICATION_BINDING');
    const derivedV2 = { ...derivedRef, version: 2 };
    f.verified.set(`${derivedReceipt.receiptDigest}|${formatReference(derivedV2)}`,
      { receipt: derivedReceipt, ref: derivedV2 });
    await expectCode(() => f.store.publishVerified(f.db, { reference: { ...derived, version: 2 },
      contentBytes: derivedBytes, receiptDigest: derivedReceipt.receiptDigest }),
    'SCI_REF_DEPENDENCY_STALE');
    await expectCode(() => f.store.markDerivedStale(f.db, { ref: derivedRef,
      causalRef: { ...f.ref, objectId: 'other' }, retractionReceiptId: retractionId,
      retractionReceiptDigest: retractionDigest }), 'SCI_REF_CAUSE_UNVERIFIED');
    const derivedStale = await f.store.markDerivedStale(f.db, { ref: derivedRef,
      causalRef: f.ref, retractionReceiptId: retractionId,
      retractionReceiptDigest: retractionDigest });
    assert.equal(derivedStale.status, 'stale');
    await expectCode(() => f.store.resolveReference(f.db, { ref: derivedRef, requesterScope: scope }),
      'SCI_REF_STALE');
    await expectCode(() => f.store.markStale(f.db, { ref: uri,
      retractionReceiptId: retractionId, retractionReceiptDigest: retractionDigest }),
    'SCI_REF_STALE_CONFLICT');
    globalRegistry.clear();
    await expectCode(() => restarted.resolveReference(f.db, { ref: uri, requesterScope: scope }), 'SCI_REF_STALE');
    console.log('Scientific references: scope, receipt, bytes, restart and retraction checks passed.');
  } finally {
    await f.db.close();
  }
}

async function testRegistryRestart() {
  const f = await fixture();
  try {
    await f.store.publishVerified(f.db, { reference: f.reference,
      contentBytes: f.bytes, receiptDigest: f.receipt.receiptDigest });
    globalRegistry.clear();
    const newStore = createScientificReferenceStore({ verifyReceipt: async (id, ref) =>
      f.verified.get(`${id}|${formatReference(ref)}`) || null });
    await expectCode(() => newStore.resolveReference(f.db, { ref: f.ref,
      requesterScope: { organizationId: 'org', projectId: 'project', workspaceId: 'w1' } }),
    'SCI_REF_RECEIPT_REJECTED');
  } finally {
    await f.db.close();
  }
}

run().then(testRegistryRestart).catch((error) => { console.error(error); process.exitCode = 1; });
