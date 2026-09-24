'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const persistent = require('../src/services/holobionte/persistentHostService');
const stops = require('../src/services/holobionte/runtime/stopConditionsService');

async function testMissionStop(db) {
  const session = await store.createSession(db, { hostId: 'mission-host', missionId: 'mission-stop' });
  const blocked = await stops.stopHolobiont(db, { holobiontId: session.holobiontId, expectedSessionRevision: session.revision });
  assert.strictEqual(blocked.stopped, false);
  assert.deepStrictEqual(blocked.reasons, ['MISSION_INCOMPLETE', 'PROMOTED_OUTPUTS_NOT_IMMUNE_VERIFIED']);
  const result = await stops.stopHolobiont(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    missionCompleted: true, allPromotedOutputsImmunePassed: true, unresolvedCriticalFailures: 0
  });
  assert.strictEqual(result.disposition, 'CLOSED');
  assert.strictEqual((await store.getSession(db, session.holobiontId)).status, 'CLOSED');
  assert.strictEqual((await store.listLifecycleEvents(db, session.holobiontId))[0].eventType, 'CLOSED');
  await assert.rejects(() => stops.stopHolobiont(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision
  }), { code: 'HOLOBIONT_REVISION_CONFLICT' });
}

async function testPersistentQuiescence(db) {
  const first = await persistent.openPersistentHost(db, {
    hostId: 'quiet-host', missionId: 'quiet-mission', constitution: { hostId: 'quiet-host' }
  });
  const stopped = await stops.stopHolobiont(db, {
    holobiontId: first.session.holobiontId, expectedSessionRevision: first.session.revision,
    missionActive: false, unresolvedCriticalFailures: 0, missionId: 'quiet-mission'
  });
  assert.strictEqual(stopped.disposition, 'QUIESCENT');
  const resumed = await persistent.openPersistentHost(db, { hostId: 'quiet-host', missionId: 'next-mission' });
  assert.strictEqual(resumed.session.holobiontId, first.session.holobiontId);
  assert.strictEqual(resumed.session.status, 'ACTIVE');
  assert.deepStrictEqual((await store.listLifecycleEvents(db, first.session.holobiontId)).map((event) => event.eventType), ['QUIESCENT', 'RESUMED']);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await testMissionStop(db);
    await testPersistentQuiescence(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont stop condition tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont stop condition tests failed:', error);
  process.exitCode = 1;
});
