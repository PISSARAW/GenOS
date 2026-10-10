'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { withTransaction } = require('../src/db');
const references = require('../src/services/scientificReferences');
const propagation = require('../src/services/scientificPropagation');

function ref(objectId, version = 1) {
  return { organizationId: 'org', projectId: 'project', workspaceId: 'space',
    objectType: 'theorem', objectId, version };
}

async function setup(db) {
  await db.exec(`CREATE TABLE workspaces (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL
  );
  CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL);
  INSERT INTO workspaces VALUES ('space', 'org', 'project');
  INSERT INTO workspaces VALUES ('other', 'org', 'project');
  INSERT INTO agents VALUES ('agent-A', 'space');
  INSERT INTO agents VALUES ('agent-B', 'space');
  INSERT INTO agents VALUES ('foreign', 'other');`);
  await references.ensureTables(db);
  await propagation.ensureTables(db);
}

async function insertReference(db, target, status) {
  await db.run(`INSERT INTO scientific_references
    (organization_id, project_id, workspace_id, object_type, object_id,
      version, content_digest, content_bytes, metadata_json, metadata_digest,
      receipt_digest, binding_digest, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  target.organizationId, target.projectId, target.workspaceId,
  target.objectType, target.objectId, target.version,
  `sha256:${'a'.repeat(64)}`, Buffer.from('test'), '{}', `sha256:${'b'.repeat(64)}`,
  `sha256:${'c'.repeat(64)}`, `sha256:${'d'.repeat(64)}`, status);
}

async function testSubscribeBeforePublication(db) {
  const source = ref('prepublication');
  const first = await propagation.subscribeReference(db, {
    ref: source, consumerAgentId: 'agent-A',
  });
  assert.equal(first.created, true);
  const again = await propagation.subscribeReference(db, {
    ref: source, consumerAgentId: 'agent-A',
  });
  assert.equal(again.created, false);
  assert.deepEqual(await propagation.consumersFor(db, { ref: source }), ['agent-A']);
  assert.deepEqual(await propagation.consumersFor(db, { ref: ref('prepublication', 2) }), []);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM scientific_dependency_edges')).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM scientific_obligations')).n, 0);

  await assert.rejects(propagation.subscribeReference(db, {
    ref: source, consumerAgentId: 'foreign',
  }), { code: 'SCI_SUB_SCOPE' });
  await assert.rejects(propagation.subscribeReference(db, {
    ref: source, consumerAgentId: 'missing',
  }), { code: 'SCI_SUB_SCOPE' });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM scientific_reference_subscriptions')).n, 1);

  await insertReference(db, source, 'verified');
  assert.deepEqual(await propagation.getDependentAgents(db, source), ['agent-A']);
  assert.equal(await propagation.satisfyObligations(db, {
    ref: source, verificationReceiptId: 'receipt-1',
  }), 1);
  assert.deepEqual(await propagation.consumersFor(db, { ref: source }), []);
  assert.deepEqual(await propagation.getDependentAgents(db, source), ['agent-A']);
  await assert.rejects(propagation.subscribeReference(db, {
    ref: source, consumerAgentId: 'agent-B',
  }), { code: 'SCI_SUB_LATE' });
  const repeated = await propagation.subscribeReference(db, {
    ref: source, consumerAgentId: 'agent-A',
  });
  assert.equal(repeated.state, 'satisfied');

  assert.equal(await propagation.staleSubscriptions(db, source), 1);
  assert.deepEqual(await propagation.getDependentAgents(db, source), []);
  await assert.rejects(propagation.subscribeReference(db, {
    ref: source, consumerAgentId: 'agent-A',
  }), { code: 'SCI_SUB_STALE' });
  await db.run(`UPDATE scientific_references SET status = 'stale'
    WHERE object_id = 'prepublication'`);
  await assert.rejects(propagation.subscribeReference(db, {
    ref: source, consumerAgentId: 'agent-B',
  }), { code: 'SCI_SUB_STALE' });
}

async function testRollback(db) {
  const source = ref('rolled-back');
  await assert.rejects(withTransaction(db, async (tx) => {
    await propagation.subscribeReference(tx, { ref: source, consumerAgentId: 'agent-A' });
    throw new Error('cancelled');
  }), /cancelled/);
  assert.deepEqual(await propagation.consumersFor(db, { ref: source }), []);
}

async function testDerivedInvalidation(db) {
  const source = ref('parent');
  const derived = ref('child');
  await propagation.registerDependencies(db, {
    consumerRef: derived, dependencies: [source], consumerAgentId: 'agent-A',
  });
  await propagation.subscribeReference(db, { ref: derived, consumerAgentId: 'agent-B' });
  const outcome = await propagation.invalidateDependents(db, {
    ref: source, retractionReceiptId: 'retraction-1',
    retractionReceiptDigest: `sha256:${'e'.repeat(64)}`, reason: 'counterexample',
  });
  assert.equal(outcome.affectedCount, 1);
  const recipients = await db.all(`SELECT recipient_agent_id FROM scientific_outbox
    WHERE event_type = 'invalidate' ORDER BY recipient_agent_id`);
  assert.deepEqual(recipients.map((row) => row.recipient_agent_id), ['agent-A', 'agent-B']);
  assert.deepEqual(await propagation.getDependentAgents(db, derived), []);
  assert.equal((await db.get(`SELECT state FROM scientific_reference_subscriptions
    WHERE reference_key = ?`, propagation.referenceKey(derived))).state, 'stale');
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await setup(db);
    await testSubscribeBeforePublication(db);
    await testRollback(db);
    await testDerivedInvalidation(db);
    console.log('Scientific prepublication subscription tests passed');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
