'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const persistent = require('../src/services/holobionte/persistentHostService');

async function testContinuity(db) {
  const first = await persistent.openPersistentHost(db, {
    hostId: 'persistent-host', missionId: 'mission-one',
    constitution: { hostId: 'persistent-host', revision: 1 },
    capabilities: ['planning'], requiredCapabilities: ['planning', 'review']
  });
  assert.strictEqual(first.reused, false);
  assert.deepStrictEqual(first.capabilityGap.missing, ['review']);
  await store.appendEvent(db, {
    holobiontId: first.session.holobiontId, expectedRevision: first.session.revision,
    eventType: 'SYMBIONT_DISCOVERED',
    payload: { symbiontId: 'resident-reviewer', symbiont: { capabilities: ['review'] } }
  });
  await store.appendEvent(db, {
    holobiontId: first.session.holobiontId, expectedRevision: first.session.revision + 1,
    eventType: 'SYMBIONT_ADMITTED', payload: { symbiontId: 'resident-reviewer' }
  });
  const resumed = await persistent.openPersistentHost(db, {
    hostId: 'persistent-host', missionId: 'mission-two', requiredCapabilities: ['planning', 'review']
  });
  assert.strictEqual(resumed.reused, true);
  assert.strictEqual(resumed.session.holobiontId, first.session.holobiontId);
  assert.strictEqual(resumed.session.constitution.hostId, 'persistent-host');
  assert.deepStrictEqual(resumed.capabilityGap.missing, []);
  assert.deepStrictEqual(resumed.session.missionHistory.map((item) => item.missionId), ['mission-one', 'mission-two']);
  assert.strictEqual(resumed.session.residentSymbionts[0].id, 'resident-reviewer');
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await testContinuity(db);
    await assert.rejects(() => persistent.openPersistentHost(db, { hostId: 'missing-mission' }), {
      code: 'HOLOBIONT_PERSISTENT_HOST_INVALID'
    });
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont persistent host tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont persistent host tests failed:', error);
  process.exitCode = 1;
});
