'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const { SYMBIONT_KINDS } = require('../src/services/holobionte/symbionts/symbiontKinds');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    const session = await store.createSession(db, { hostId: 'kind-host', missionId: 'kind-mission' });
    for (const [index, kind] of SYMBIONT_KINDS.entries()) {
      await store.appendEvent(db, {
        holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED',
        expectedRevision: index + 1,
        payload: { symbiontId: `sym-${kind}`, symbiont: { kind } }
      });
    }
    const restored = await store.getSession(db, session.holobiontId);
    assert.deepStrictEqual(restored.candidateSymbionts.map((item) => item.kind), SYMBIONT_KINDS);
    await assert.rejects(() => store.appendEvent(db, {
      holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED',
      expectedRevision: restored.revision,
      payload: { symbiontId: 'invalid-kind', symbiont: { kind: 'PROMPT_FOREST' } }
    }), { code: 'HOLOBIONT_SYMBIONT_KIND_INVALID' });
    assert.strictEqual((await store.getSession(db, session.holobiontId)).revision, restored.revision);
    await store.appendEvent(db, {
      holobiontId: session.holobiontId, eventType: 'SYMBIONT_DISCOVERED',
      expectedRevision: restored.revision,
      payload: { symbiontId: 'legacy-agent', symbiont: { role: 'reviewer' } }
    });
    assert.strictEqual((await store.getSession(db, session.holobiontId)).candidateSymbionts.at(-1).kind, 'AGENT');
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont symbiont kind tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont symbiont kind tests failed:', error);
  process.exitCode = 1;
});
