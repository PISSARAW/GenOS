'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

const bus = require('../src/services/epistemic/contradictionBus');
const signalDelivery = require('../src/services/signalDeliveryService');
const { getDatabase, closeDatabase } = require('../src/db');
const { missionStartFingerprint, activeMissionConflict } = require('../src/services/agentRuntimeAdapter/missionStartIdentity');
const { recordValidAttestation } = require('../src/services/epistemic/aeisPromotionBridge');

async function testContradictionBusCollisionSafety(db) {
  bus.configureEventStore(db);
  bus.pendingEvents.length = 0;

  // Two different events sharing the same 50+ character prefix
  const payloadPrefix = 'urn:genos:epistemic:domain:core:subdomain:knowledge:long_topic_name:';
  const event1 = {
    type: 'contradiction',
    payload: { subject: `${payloadPrefix}alpha`, detail: 'first distinct contradiction' },
    emittedAt: new Date().toISOString()
  };
  const event2 = {
    type: 'contradiction',
    payload: { subject: `${payloadPrefix}beta`, detail: 'second distinct contradiction' },
    emittedAt: new Date().toISOString()
  };

  bus.recordEvent(event1);
  bus.recordEvent(event2);

  // Both distinct events must be recorded without collision
  assert.equal(bus.pendingEvents.length, 2, 'Distinct events with long shared prefix must both be recorded');

  // Exact duplicate of event1 must be deduplicated
  bus.recordEvent(event1);
  assert.equal(bus.pendingEvents.length, 2, 'Duplicate event must be deduplicated in pendingEvents');
}

async function testSignalDeliveryIdempotentClaim(db) {
  const signalId = 'sig-test-dedup-1';
  const subscriberAgentId = 'agent-subscriber-1';

  // Seed agent and pending delivery
  await db.run(
    'INSERT INTO agents (id, name, role, status) VALUES (?, ?, ?, ?)',
    subscriberAgentId, 'Subscriber Agent', 'worker', 'idle'
  );
  await db.run(
    'INSERT INTO signal_deliveries (signal_id, subscriber_agent_id, status) VALUES (?, ?, ?)',
    signalId, subscriberAgentId, 'pending'
  );

  const claimInput1 = {
    signalId, subscriberAgentId, owner: 'worker-1:uuid-1', now: Date.now(), leaseMs: 30000
  };
  const claimInput2 = {
    signalId, subscriberAgentId, owner: 'worker-2:uuid-2', now: Date.now(), leaseMs: 30000
  };

  const claimed1 = await signalDelivery.claimPendingDelivery(db, claimInput1);
  const claimed2 = await signalDelivery.claimPendingDelivery(db, claimInput2);

  assert.equal(claimed1, true, 'First worker must successfully claim pending delivery');
  assert.equal(claimed2, false, 'Second worker must be refused concurrent claim on same delivery');

  // Complete delivery
  const completed = await signalDelivery.completeClaimedDelivery(db, claimInput1);
  assert.equal(completed, true, 'Claim owner must complete delivery');

  // Subsequent claim attempt on delivered signal must fail
  const claimedAfter = await signalDelivery.claimPendingDelivery(db, claimInput2);
  assert.equal(claimedAfter, false, 'Delivered signal cannot be re-claimed');
}

function testMissionFingerprintIdempotency() {
  const missionA = {
    agentId: 'agent-dedup-1',
    role: 'worker',
    budgets: { cpu: 100, memory: 512 }
  };
  const missionB = {
    role: 'worker',
    budgets: { memory: 512, cpu: 100 },
    agentId: 'agent-dedup-1'
  };

  const fpA = missionStartFingerprint(missionA);
  const fpB = missionStartFingerprint(missionB);

  assert.equal(fpA, fpB, 'Identical missions with different key order must yield identical start fingerprint');
}

async function main() {
  process.env.GENOS_TEST_MODE = '1';
  process.env.NODE_ENV = 'test';

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-dedup-test-'));
  const dbPath = path.join(tmpDir, 'test_dedup.db');

  try {
    const db = await getDatabase(dbPath);

    await testContradictionBusCollisionSafety(db);
    await testSignalDeliveryIdempotentClaim(db);
    testMissionFingerprintIdempotency();

    await closeDatabase();
    console.log('Transitions and deduplication boundaries tests passed successfully.');
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

main().catch((err) => {
  console.error('Transitions deduplication test failed:', err);
  process.exit(1);
});
