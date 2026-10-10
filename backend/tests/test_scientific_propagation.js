const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { withTransaction } = require('../src/db');
const propagation = require('../src/services/scientificPropagation');

function ref(objectId, version = 1) {
  return { organizationId: 'org', projectId: 'project', workspaceId: 'space',
    objectType: 'theorem', objectId, version };
}

async function testAtomicPublish(db) {
  const source = ref('source');
  const derived = ref('derived');
  await assert.rejects(withTransaction(db, async (tx) => {
    await propagation.registerDependencies(tx, {
      consumerRef: derived, dependencies: [source], consumerAgentId: 'agent-A',
    });
    await propagation.enqueueEvent(tx, { eventType: 'publish', ref: derived });
    throw new Error('publication failed');
  }), /publication failed/);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM scientific_dependency_edges')).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM scientific_outbox')).n, 0);

  await withTransaction(db, async (tx) => {
    await propagation.registerDependencies(tx, {
      consumerRef: derived, dependencies: [source], consumerAgentId: 'agent-A',
    });
    await propagation.registerDependencies(tx, {
      consumerRef: derived, dependencies: [source], consumerAgentId: 'agent-B',
    });
    await propagation.enqueueEvent(tx, { eventType: 'publish', ref: source,
      recipients: ['agent-A'] });
  });
  assert.deepEqual((await propagation.getDependentAgents(db, source)).sort(), ['agent-A', 'agent-B']);
  assert.deepEqual((await propagation.consumersFor(db, { ref: source })).sort(), ['agent-A', 'agent-B']);
  assert.deepEqual(await propagation.consumersFor(db, { ref: ref('source', 2) }), []);
  assert.deepEqual(await propagation.consumersFor(db, { ref: ref('unrelated') }), []);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM scientific_obligations')).n, 2);
  await assert.rejects(propagation.registerDependencies(db, {
    consumerRef: source, dependencies: [derived], consumerAgentId: 'agent-C',
  }), /cycle/);
  assert.equal(await propagation.satisfyObligations(db, {
    ref: ref('source', 2), verificationReceiptId: 'receipt-v2',
  }), 0);
  assert.equal(await propagation.satisfyObligations(db, {
    ref: source, verificationReceiptId: 'receipt-v1',
  }), 2);
  assert.deepEqual(await propagation.consumersFor(db, { ref: source }), []);
}

async function testRetractionRollback(db) {
  const source = ref('rollback-source');
  const derived = ref('rollback-derived');
  await propagation.registerDependencies(db, {
    consumerRef: derived, dependencies: [source], consumerAgentId: 'agent-C',
  });
  await assert.rejects(withTransaction(db, async (tx) => {
    await propagation.invalidateDependents(tx, {
      ref: source, retractionReceiptId: 'receipt-rollback',
      retractionReceiptDigest: `sha256:${'b'.repeat(64)}`, reason: 'probe',
    });
    throw new Error('retraction aborted');
  }), /retraction aborted/);
  assert.equal((await db.get(`SELECT state FROM scientific_dependency_edges
    WHERE consumer_key = ? AND dependency_key = ?`,
  [propagation.referenceKey(derived), propagation.referenceKey(source)])).state, 'active');
  assert.equal((await db.get(`SELECT COUNT(*) AS n FROM scientific_suspensions
    WHERE origin_key = ?`, propagation.referenceKey(source))).n, 0);
  assert.equal((await db.get(`SELECT COUNT(*) AS n FROM scientific_outbox
    WHERE subject_key = ?`, propagation.referenceKey(derived))).n, 0);
}

async function testOutbox(db) {
  const source = ref('source');
  await propagation.enqueueEvent(db, { eventType: 'publish', ref: source,
    recipients: ['agent-A'] });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM scientific_outbox')).n, 1);
  await propagation.enqueueEvent(db, { eventType: 'retract', ref: source,
    recipients: ['agent-A'], payload: { retractionReceiptId: 'receipt-1' } });
  const first = await propagation.claimEvents(db, { workerId: 'worker-1', nowMs: 1000, leaseMs: 1000 });
  assert.equal(first[0].event_type, 'retract');
  assert.equal(await propagation.ackEvent(db, {
    eventId: first[0].event_id, workerId: 'wrong', claimToken: first[0].claim_token,
  }), false);
  const recovered = await propagation.claimEvents(db, { workerId: 'worker-2', nowMs: 2001, limit: 1 });
  assert.equal(recovered[0].event_id, first[0].event_id);
  assert.equal(await propagation.ackEvent(db, {
    eventId: first[0].event_id, workerId: 'worker-1', claimToken: first[0].claim_token,
  }), false);
  assert.equal(await propagation.ackEvent(db, {
    eventId: recovered[0].event_id, workerId: 'worker-2', claimToken: recovered[0].claim_token,
  }), true);
  assert.equal((await db.get('SELECT attempts FROM scientific_outbox WHERE event_id = ?',
    recovered[0].event_id)).attempts, 2);
}

async function testRetraction(db) {
  const source = ref('source');
  const derived = ref('derived');
  const downstream = ref('downstream');
  await propagation.registerDependencies(db, {
    consumerRef: downstream, dependencies: [derived], consumerAgentId: 'agent-B',
  });
  await assert.rejects(propagation.invalidateDependents(db, {
    ref: source, retractionReceiptId: 'receipt-1', reason: 'counterexample',
  }), /digest/);
  const outcome = await withTransaction(db, async (tx) => {
    await propagation.enqueueEvent(tx, { eventType: 'retract', ref: source,
      idempotencyKey: 'receipt-1' });
    return propagation.invalidateDependents(tx, {
      ref: source, retractionReceiptId: 'receipt-1',
      retractionReceiptDigest: `sha256:${'a'.repeat(64)}`, reason: 'counterexample',
    });
  });
  assert.equal(outcome.affectedCount, 2);
  assert.deepEqual(outcome.affectedRefs.map((item) =>
    [item.ref.objectId, item.causalRef.objectId]),
  [['derived', 'source'], ['downstream', 'derived']]);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM scientific_dependency_edges WHERE state = 'stale'")).n, 2);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM scientific_obligations WHERE state = 'stale'")).n, 3);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM scientific_suspensions')).n, 2);
  const eventTypes = await db.all('SELECT event_type FROM scientific_outbox ORDER BY priority DESC');
  assert.equal(eventTypes[0].event_type, 'retract');
  assert.equal(eventTypes.filter((row) => row.event_type === 'invalidate').length, 3);
  assert.equal((await db.get('SELECT retraction_receipt_digest AS digest FROM scientific_suspensions LIMIT 1')).digest,
    `sha256:${'a'.repeat(64)}`);
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await propagation.ensureTables(db);
    await testAtomicPublish(db);
    await testOutbox(db);
    await testRetractionRollback(db);
    await testRetraction(db);
    console.log('Scientific propagation tests passed');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
