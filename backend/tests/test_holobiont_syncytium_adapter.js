'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const syncytium = require('../src/services/syncytiumPersistenceService');
const adapter = require('../src/services/holobionte/symbionts/syncytiumAdapter');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    const host = await store.createSession(db, {
      hostId: 'syncytium-host', scope: 'PERSISTENT', constitution: { hostId: 'syncytium-host' }
    });
    await syncytium.createSession(db, { sessionId: 'shared-code-session', state: {
      text: 'shared state', fields: { status: 'verified' }, typedFields: {}, cursors: {}, invariants: {}, causalFrontier: {}
    } });
    const result = await adapter.registerSyncytiumCandidate(db, {
      holobiontId: host.holobiontId, expectedSessionRevision: host.revision,
      syncytiumSessionId: 'shared-code-session', memberIds: ['member-a', 'member-b'],
      capabilities: ['collaborative-code-review'], evidenceRefs: ['snapshot:verified', 'invariant:passed']
    });
    assert.strictEqual(result.candidate.kind, 'SUB_TOPOLOGY');
    assert.strictEqual(result.candidate.topology, 'syncytium');
    assert.match(result.candidate.stateHash, /^sha256:/);
    assert.strictEqual(result.status, 'CANDIDATE');
    const session = await store.getSession(db, host.holobiontId);
    assert.strictEqual(session.candidateSymbionts[0].syncytiumSessionId, 'shared-code-session');
    await assert.rejects(() => adapter.registerSyncytiumCandidate(db, {
      holobiontId: host.holobiontId, expectedSessionRevision: session.revision,
      syncytiumSessionId: 'shared-code-session', memberIds: ['member-a'],
      capabilities: ['collaborative-code-review'], evidenceRefs: ['snapshot:verified']
    }), { code: 'HOLOBIONT_SYNCYTIUM_MEMBERS_REQUIRED' });
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Syncytium integration tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Syncytium integration tests failed:', error);
  process.exitCode = 1;
});
