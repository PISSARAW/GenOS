'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const persistentHost = require('../src/services/holobionte/persistentHostService');
const adapter = require('../src/services/holobionte/morphogenesisAdapter');

async function buildPersistentHost(db) {
  const first = await persistentHost.openPersistentHost(db, {
    hostId: 'morphogenesis-host', missionId: 'mission-first', constitution: { hostId: 'morphogenesis-host' }
  });
  await store.appendEvent(db, {
    holobiontId: first.session.holobiontId, expectedRevision: first.session.revision,
    eventType: 'SYMBIONT_DISCOVERED',
    payload: { symbiontId: 'resident-planner', symbiont: { capabilities: ['planning', 'review'] } }
  });
  await store.appendEvent(db, {
    holobiontId: first.session.holobiontId, expectedRevision: first.session.revision + 1,
    eventType: 'SYMBIONT_ADMITTED', payload: { symbiontId: 'resident-planner' }
  });
  await persistentHost.openPersistentHost(db, {
    hostId: 'morphogenesis-host', missionId: 'mission-second'
  });
  return store.getSession(db, first.session.holobiontId);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    const session = await buildPersistentHost(db);
    const result = await adapter.planPersistentHost(db, {
      holobiontId: session.holobiontId, proposedTopology: 'specialist_expert_committee',
      budget: 100
    });
    assert.strictEqual(result.activated, true);
    assert.strictEqual(result.missionsObserved, 2);
    assert.deepStrictEqual(result.residentCapabilities, ['planning', 'review']);
    assert.ok(result.plan);
    const missionSession = await store.createSession(db, { hostId: 'mission-only', missionId: 'mission-only' });
    assert.strictEqual((await adapter.planPersistentHost(db, { holobiontId: missionSession.holobiontId })).reason,
      'PERSISTENT_IDENTITY_REQUIRED');
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Morphogenesis integration tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Morphogenesis integration tests failed:', error);
  process.exitCode = 1;
});
