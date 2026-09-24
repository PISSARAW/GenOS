'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const adapter = require('../src/services/holobionte/symbionts/residentDaemonAdapter');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    const host = await store.createSession(db, {
      hostId: 'daemon-host', scope: 'PERSISTENT', constitution: { hostId: 'daemon-host' }
    });
    const registered = await adapter.registerResidentDaemon(db, {
      holobiontId: host.holobiontId, expectedSessionRevision: host.revision,
      daemonId: 'daemon.architecture-watch', territoryId: 'project.genos',
      name: 'Architecture daemon', capabilities: ['architecture-review'],
      evidenceRefs: ['daemon-registry:architecture-watch']
    });
    assert.strictEqual(registered.kind, 'DAEMON');
    assert.strictEqual(registered.status, 'CANDIDATE');
    const resumed = await store.getSession(db, host.holobiontId);
    assert.deepStrictEqual(resumed.candidateSymbionts[0], {
      kind: 'DAEMON', daemonId: 'daemon.architecture-watch', territoryId: 'project.genos',
      name: 'Architecture daemon', capabilities: ['architecture-review'], cadence: 'LOW_FREQUENCY',
      executionLocal: true, scope: 'PERSISTENT', evidenceRefs: ['daemon-registry:architecture-watch'],
      id: registered.symbiontId, status: 'CANDIDATE'
    });
    await assert.rejects(() => adapter.registerResidentDaemon(db, {
      holobiontId: host.holobiontId, expectedSessionRevision: resumed.revision,
      daemonId: 'daemon.architecture-watch', territoryId: 'project.genos',
      name: 'duplicate', capabilities: ['architecture-review'], evidenceRefs: ['ref']
    }), { code: 'HOLOBIONT_DAEMON_ALREADY_REGISTERED' });
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont resident daemon tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont resident daemon tests failed:', error);
  process.exitCode = 1;
});
