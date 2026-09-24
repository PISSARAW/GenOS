'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontMemory } = require('../src/db/migrations/migrateHolobiontMemory');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const memory = require('../src/services/holobionte/memory/symbioticMemoryService');

async function createSession(db, scope, missionId) {
  const session = await store.createSession(db, {
    hostId: 'host-memory', scope, missionId,
    workspaceId: scope === 'WORKSPACE' ? 'workspace-memory' : undefined,
    projectId: scope === 'PROJECT' ? 'project-memory' : undefined
  });
  const hostConstitution = constitution.createHostConstitution({
    hostId: session.hostId, identity: 'continuous-host',
    privacyPolicy: { restricted: ['credentials'] }
  });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: 1
  });
  return session.holobiontId;
}

async function testScopedRecallAndRetraction(db) {
  const persistentId = await createSession(db, 'PERSISTENT');
  const persistent = await store.getSession(db, persistentId);
  const saved = await memory.recordMemory(db, {
    holobiontId: persistentId, expectedSessionRevision: persistent.revision,
    memoryType: 'HOST_CONTINUITY', scope: 'PERSISTENT',
    content: { identity: 'continuous-host', preference: 'French documentation' },
    evidenceRefs: ['receipt:host-continuity'], authorId: 'host'
  });
  const missionA = await createSession(db, 'MISSION', 'mission-a');
  const missionASession = await store.getSession(db, missionA);
  const episodic = await memory.recordMemory(db, {
    holobiontId: missionA, expectedSessionRevision: missionASession.revision,
    memoryType: 'EPISODIC', content: 'Mission A verified a deployment rollback.',
    evidenceRefs: ['receipt:mission-a'], authorId: 'host'
  });
  const missionB = await createSession(db, 'MISSION', 'mission-b');
  const recalled = await memory.recallMemories(db, { holobiontId: missionB });
  assert.deepStrictEqual(recalled.map((item) => item.memoryId), [saved.memoryId]);
  assert.strictEqual(recalled[0].immuneReview.allowed, true);
  const retracted = await memory.retractMemory(db, {
    holobiontId: missionB, memoryId: saved.memoryId, expectedMemoryRevision: 1,
    reason: 'continuity preference is obsolete'
  });
  assert.strictEqual(retracted.status, 'RETRACTED');
  assert.strictEqual((await memory.recallMemories(db, { holobiontId: missionB })).length, 0);
  await assert.rejects(() => db.run('UPDATE holobiont_memories SET status = ? WHERE memory_id = ?', 'RETRACTED', episodic.memoryId));
  await assert.rejects(() => db.run('DELETE FROM holobiont_memories WHERE memory_id = ?', episodic.memoryId));
}

async function testPrivacyAndProcedureProof(db) {
  const missionId = await createSession(db, 'MISSION', 'mission-private');
  const session = await store.getSession(db, missionId);
  await assert.rejects(() => memory.recordMemory(db, {
    holobiontId: missionId, expectedSessionRevision: session.revision,
    memoryType: 'EPISODIC', content: 'Credential discovered.', dataClasses: ['credentials'],
    evidenceRefs: ['receipt:private']
  }), { code: 'HOLOBIONT_PRIVACY_VIOLATION' });
  await assert.rejects(() => memory.recordMemory(db, {
    holobiontId: missionId, expectedSessionRevision: session.revision,
    memoryType: 'PROCEDURAL', content: 'Run deployment rollback.',
    evidenceRefs: ['receipt:procedure']
  }), { code: 'HOLOBIONT_PROCEDURE_UNVERIFIED' });
  assert.strictEqual((await memory.recallMemories(db, { holobiontId: missionId })).length, 0);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontMemory(db);
    await testScopedRecallAndRetraction(db);
    await testPrivacyAndProcedureProof(db);
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Memory Plane tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Memory Plane tests failed:', error);
  process.exitCode = 1;
});
