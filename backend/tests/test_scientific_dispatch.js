const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const propagation = require('../src/services/scientificPropagation');
const subscriber = require('../src/services/signalPlaneSubscriber');
const { publishScientificSignal } = require('../src/services/scientificPropagation/transport');
const { createEnvelope } = require('../src/services/communication/communicationEnvelopeService');
const { formatSignalForTransport } = require('../src/services/biomimeticSignalingBus');

function ref(objectId) {
  return { organizationId: 'org', projectId: 'project', workspaceId: 'space',
    objectType: 'result', objectId, version: 1 };
}

async function createDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await propagation.ensureTables(db);
  await db.exec(`CREATE TABLE signal_blobs (
      signal_id TEXT PRIMARY KEY, signal_type TEXT, signal_blob BLOB, sender_agent_id TEXT,
      content TEXT, topic TEXT, expires_at TEXT);
    CREATE TABLE signal_deliveries (
      signal_id TEXT NOT NULL, subscriber_agent_id TEXT NOT NULL, status TEXT NOT NULL,
      delivered_at TEXT,
      PRIMARY KEY (signal_id, subscriber_agent_id)
    );
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('space', 'org', 'project');
    INSERT INTO workspaces VALUES ('other-space', 'org', 'project');
    CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT, workspace_id TEXT,
      status TEXT, execution_mode TEXT, parent_agent_id TEXT);
    INSERT INTO agents VALUES ('sender', 'Sender', 'space', 'running', 'orchestrator', NULL);
    INSERT INTO agents VALUES ('receiver', 'Receiver', 'space', 'running', 'worker', 'sender');
    INSERT INTO agents VALUES ('other-receiver', 'Other', 'other-space', 'running', 'worker', 'sender');
    CREATE TABLE signal_channel_weights (channel TEXT PRIMARY KEY, weight REAL,
      last_updated INTEGER, hits INTEGER, misses INTEGER, last_signal_type TEXT);
    CREATE TABLE scientific_references (organization_id TEXT, project_id TEXT,
      workspace_id TEXT, object_type TEXT, object_id TEXT, version INTEGER, status TEXT,
      PRIMARY KEY (organization_id, project_id, workspace_id, object_type, object_id, version));`);
  return db;
}

async function queue(db, input) {
  const { objectId, payload = { senderAgentId: 'sender' }, recipient = 'receiver' } = input;
  await db.run(`INSERT INTO scientific_references
    (organization_id, project_id, workspace_id, object_type, object_id, version, status)
    VALUES ('org', 'project', 'space', 'result', ?, 1, 'verified')`, objectId);
  const [eventId] = await propagation.enqueueEvent(db, {
    eventType: 'publish', ref: ref(objectId), recipientAgentId: recipient, payload,
  });
  return eventId;
}

async function persistDelivery(db, params) {
  const envelope = createEnvelope({ messageId: params.signalId, kind: 'signal',
    modality: params.signalType, senderAgentId: params.senderAgentId,
    recipientAgentIds: params.recipientAgentIds, payload: params.signalData });
  const formatted = formatSignalForTransport({ signalType: params.signalType,
    signalData: { ...params.signalData, communicationEnvelope: envelope } });
  await db.run(`INSERT INTO signal_blobs
    (signal_id, signal_type, signal_blob, sender_agent_id) VALUES (?, ?, ?, ?)`,
  params.signalId, params.signalType, formatted.signalBlob, params.senderAgentId);
  await db.run(`INSERT INTO signal_deliveries (signal_id, subscriber_agent_id, status)
    VALUES (?, ?, 'pending')`, [params.signalId, params.recipientAgentIds[0]]);
}

async function testSuccessfulDispatch(db) {
  const eventId = await queue(db, { objectId: 'success' });
  let seen;
  const [result] = await propagation.dispatchOutbox(db, {
    workerId: 'dispatcher-1', publishSignal: async (params) => {
      seen = params;
      await persistDelivery(db, params);
      return { published: true, signalId: params.signalId, llmRequired: false };
    },
  });
  assert.equal(result.acked, true);
  assert.equal(seen.signalId, propagation.signalIdFor(eventId));
  assert.deepEqual(seen.recipientAgentIds, ['receiver']);
  assert.equal(seen.senderAgentId, 'sender');
  assert.equal(seen.signalData.scientificRef.objectId, 'success');
  assert.equal((await db.get('SELECT state FROM scientific_outbox WHERE event_id = ?', eventId)).state, 'acked');
}

async function testRetryFailures(db) {
  const failures = [
    { name: 'suppressed', result: { published: false, suppressedBy: 'rate_limit' } },
    { name: 'coalesced', result: { published: false, coalesced: true } },
    { name: 'llm-only', result: { published: true, llmRequired: true } },
    { name: 'missing-delivery', result: { published: true, llmRequired: false } },
  ];
  for (const failure of failures) {
    const eventId = await queue(db, { objectId: failure.name });
    const [outcome] = await propagation.dispatchOutbox(db, {
      workerId: `dispatcher-${failure.name}`, limit: 1,
      publishSignal: async (params) => ({ ...failure.result, signalId: params.signalId }),
    });
    assert.equal(outcome.acked, false, failure.name);
    assert.equal((await db.get('SELECT state FROM scientific_outbox WHERE event_id = ?', eventId)).state,
      'pending', failure.name);
    await db.run("UPDATE scientific_outbox SET state = 'acked' WHERE event_id = ?", eventId);
  }
}

async function testRecoveredDelivery(db) {
  const eventId = await queue(db, { objectId: 'recovered' });
  await persistDelivery(db, { signalId: propagation.signalIdFor(eventId), signalType: 'ligand',
    senderAgentId: 'sender', recipientAgentIds: ['receiver'],
    signalData: { outboxEventId: eventId, scientificRef: ref('recovered') } });
  const [outcome] = await propagation.dispatchOutbox(db, {
    workerId: 'dispatcher-recovered',
    publishSignal: async () => { throw new Error('must not republish'); },
  });
  assert.equal(outcome.acked, true);
  assert.equal(outcome.recovered, true);
}

async function testMissingIdentity(db) {
  const eventId = await queue(db, { objectId: 'no-sender', payload: {} });
  const [outcome] = await propagation.dispatchOutbox(db, {
    workerId: 'dispatcher-identity', publishSignal: async () => {
      throw new Error('must not publish');
    },
  });
  assert.equal(outcome.acked, false);
  assert.match(outcome.reason, /sender and recipient/);
  assert.equal((await db.get('SELECT state FROM scientific_outbox WHERE event_id = ?', eventId)).state,
    'pending');
  await db.run("UPDATE scientific_outbox SET state = 'acked' WHERE event_id = ?", eventId);
}

async function testSpoofedDelivery(db) {
  const eventId = await queue(db, { objectId: 'spoofed' });
  const signalId = propagation.signalIdFor(eventId);
  await persistDelivery(db, { signalId, signalType: 'ligand', senderAgentId: 'sender',
    recipientAgentIds: ['receiver'], signalData: { outboxEventId: eventId,
      scientificRef: ref('different') } });
  assert.equal(await propagation.hasDurableDelivery(db, { signalId,
    recipientAgentId: 'receiver', senderAgentId: 'sender', eventId,
    ref: ref('spoofed') }), false);
  const [outcome] = await propagation.dispatchOutbox(db, { workerId: 'dispatcher-spoofed',
    publishSignal: async () => ({ published: false }) });
  assert.equal(outcome.acked, false);
  await db.run("UPDATE scientific_outbox SET state = 'acked' WHERE event_id = ?", eventId);
}

async function testNativeScientificTransport(db) {
  const eventId = await queue(db, { objectId: 'native' });
  const [outcome] = await propagation.dispatchOutbox(db, { workerId: 'native-dispatch' });
  assert.equal(outcome.eventId, eventId);
  assert.equal(outcome.acked, true);
  assert.equal(await propagation.hasDurableDelivery(db, {
    signalId: propagation.signalIdFor(eventId), recipientAgentId: 'receiver',
    senderAgentId: 'sender', eventId, ref: ref('native') }), true);
}

async function testNativeScopeDenial(db) {
  const eventId = await queue(db, { objectId: 'scope-denied', recipient: 'other-receiver' });
  const [outcome] = await propagation.dispatchOutbox(db, { workerId: 'native-scope-denial' });
  assert.equal(outcome.eventId, eventId);
  assert.equal(outcome.acked, false);
  assert.match(outcome.reason, /scope mismatch/);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM signal_blobs WHERE signal_id = ?',
    propagation.signalIdFor(eventId))).count, 0);
  const row = await db.get('SELECT next_attempt_ms FROM scientific_outbox WHERE event_id = ?', eventId);
  assert.ok(row.next_attempt_ms > 0);
  assert.equal((await propagation.claimEvents(db, { workerId: 'too-early',
    nowMs: row.next_attempt_ms - 1 })).length, 0);
  assert.equal((await propagation.claimEvents(db, { workerId: 'after-backoff',
    nowMs: row.next_attempt_ms })).length, 1);
}

async function testSubscriberPoll(db) {
  const eventId = await queue(db, { objectId: 'subscriber' });
  await subscriber.pollScientificOutbox(db);
  const row = await db.get('SELECT state FROM scientific_outbox WHERE event_id = ?', eventId);
  assert.equal(row.state, 'acked');
}

async function testSupersededPublish(db) {
  const eventId = await queue(db, { objectId: 'superseded' });
  await db.run("UPDATE scientific_references SET status = 'stale' WHERE object_id = 'superseded'");
  const [outcome] = await propagation.dispatchOutbox(db, { workerId: 'superseded-dispatch' });
  assert.equal(outcome.eventId, eventId);
  assert.equal(outcome.acked, true);
  assert.equal(outcome.superseded, true);
  const signalId = propagation.signalIdFor(eventId);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM signal_blobs WHERE signal_id = ?',
    signalId)).count, 0);
  await assert.rejects(() => publishScientificSignal(db, { signalId, signalType: 'ligand',
    senderAgentId: 'sender', recipientAgentIds: ['receiver'], topic: 'scientific:publish',
    signalData: { senderAgentId: 'sender', eventType: 'publish', outboxEventId: eventId,
      scientificRef: ref('superseded') } }), /superseded/);
}

async function main() {
  const db = await createDatabase();
  try {
    await testSuccessfulDispatch(db);
    await testRetryFailures(db);
    await testRecoveredDelivery(db);
    await testMissingIdentity(db);
    await testSpoofedDelivery(db);
    await testNativeScientificTransport(db);
    await testNativeScopeDenial(db);
    await testSubscriberPoll(db);
    await testSupersededPublish(db);
    console.log('Scientific dispatch tests passed');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
