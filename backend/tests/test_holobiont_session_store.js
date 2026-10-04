'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');
const variantRuntime = require('../src/services/holobionte/variants/variantRuntimeController');

async function testSessionLifecycle(db) {
  const session = await store.createSession(db, {
    hostId: 'host-test', missionId: 'mission-test', scope: 'MISSION'
  });
  assert.strictEqual(session.revision, 1);
  assert.strictEqual(session.events[0].eventType, 'HOST_CREATED');

  await store.appendEvent(db, {
    holobiontId: session.holobiontId,
    eventType: 'SYMBIONT_DISCOVERED',
    expectedRevision: 1,
    payload: { symbiontId: 'sym-test', symbiont: { role: 'translator' } }
  });
  await store.appendEvent(db, {
    holobiontId: session.holobiontId,
    eventType: 'SYMBIONT_ADMITTED',
    expectedRevision: 2,
    payload: { symbiontId: 'sym-test' }
  });

  const restored = await store.getSession(db, session.holobiontId);
  assert.strictEqual(restored.revision, 3);
  assert.strictEqual(restored.candidateSymbionts.length, 0);
  assert.strictEqual(restored.residentSymbionts[0].id, 'sym-test');
  assert.strictEqual(restored.events.length, 3);
  return session.holobiontId;
}

async function testRevisionAndScopeValidation(db) {
  await assert.rejects(() => store.createSession(db, { hostId: 'host-no-mission' }), {
    code: 'HOLOBIONT_SESSION_INVALID'
  });
  await assert.rejects(() => store.createSession(db, {
    hostId: 'host-bad-scope', scope: 'WORKSPACE'
  }), { code: 'HOLOBIONT_SESSION_INVALID' });
  await assert.rejects(() => store.appendEvent(db, {
    holobiontId: 'missing', eventType: 'SYMBIONT_DISCOVERED', expectedRevision: 0
  }), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  await assert.rejects(() => store.appendEvent(db, {
    holobiontId: 'missing', eventType: 'SYMBIONT_DISCOVERED', payload: []
  }), { code: 'HOLOBIONT_EVENT_INVALID' });
}

async function testAppendOnly(db) {
  await assert.rejects(() => db.run('UPDATE holobiont_events SET event_type = ? WHERE revision = 1', 'IMMUNE_OVERRIDE'));
  await assert.rejects(() => db.run('DELETE FROM holobiont_events WHERE revision = 1'));
}

async function testAdaptiveCycleEvidenceAtomicity(db) {
  const session = await store.createSession(db, {
    hostId: 'host-ecology', missionId: 'mission-ecology', scope: 'MISSION'
  });
  const selection = await variantRuntime.selectPersistentVariant(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    variantId: 'adaptive-microbiome', fitContext: { capabilities: ['diversity'], successionAvailable: true }
  });
  const input = {
    holobiontId: session.holobiontId, expectedSessionRevision: selection.sessionRevision,
    operation: 'runEcologicalCycle', runtimeInput: {
      evidenceRefs: ['receipt://cycle'], dysbiosisSignals: {
        resourceConcentration: 0, dependencyConcentration: 0, harmfulActivity: 0,
        conflictRate: 0, immunePressure: 0, functionalRedundancy: 1
      }
    },
    evidenceRefs: ['receipt://cycle']
  };
  await assert.rejects(() => variantRuntime.evaluatePersistentVariant(db, {
    ...input, verifyEvaluationEvidence: () => false
  }), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  const unchanged = await store.getSession(db, session.holobiontId);
  assert.equal(unchanged.revision, selection.sessionRevision);
  assert.equal(unchanged.ecologicalState.cycle, 0);

  const evaluated = await variantRuntime.evaluatePersistentVariant(db, {
    ...input, verifyEvaluationEvidence: () => true
  });
  const committed = await store.getSession(db, session.holobiontId);
  assert.equal(evaluated.sessionRevision, selection.sessionRevision + 2);
  assert.equal(committed.ecologicalState.cycle, 1);
  assert.deepEqual(committed.events.slice(-2).map((event) => event.eventType), [
    'ECOLOGICAL_CYCLE_COMPLETED', 'VARIANT_RUNTIME_EVALUATED'
  ]);
}

async function run() {
  const dbPath = path.join(os.tmpdir(), `holobiont-session-${Date.now()}.db`);
  let db = await open({ filename: dbPath, driver: sqlite3.Database });
  await migrateHolobiontSessions(db);
  const sessionId = await testSessionLifecycle(db);
  await testRevisionAndScopeValidation(db);
  await testAppendOnly(db);
  await testAdaptiveCycleEvidenceAtomicity(db);
  await db.close();
  db = await open({ filename: dbPath, driver: sqlite3.Database });
  await migrateHolobiontSessions(db);
  const restored = await store.getSession(db, sessionId);
  assert.strictEqual(restored.residentSymbionts[0].id, 'sym-test');
  assert.strictEqual(restored.events.length, 3);
  await db.close();
  fs.unlinkSync(dbPath);
  console.log('✅ Holobiont session store tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont session store tests failed:', error);
  process.exitCode = 1;
});
