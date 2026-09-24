'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const store = require('../src/services/biocenose/communityStore');
const biocenose = require('../src/services/biocenoseService');
const { migrateBiocenoseSessions } = require('../src/db/migrations/migrateBiocenoseSessions');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateBiocenoseSessions(db);
    await migrateBiocenoseSessions(db);
    const created = await store.createSession(db, {
      missionId: 'mission-1',
      question: 'Which option is supported?',
      members: [
        { memberId: 'generator-1', role: 'generator', provider: 'provider-a' },
        { memberId: 'reviewer-1', role: 'reviewer', provider: 'provider-b' }
      ]
    });
    assert.equal(created.phase, 'CONSTITUTION');
    assert.equal(created.revision, 2);

    const restored = await store.loadSession(db, created.communityId);
    assert.equal(restored.members.length, 2);
    assert.equal(restored.members[0].memberId, 'generator-1');
    assert.equal(restored.members[0].provider, 'provider-a');

    const changed = await store.appendEvent(db, {
      communityId: created.communityId,
      actorId: 'orchestrator-1',
      type: 'PHASE_CHANGED',
      payload: { reason: 'formation started' },
      patch: { phase: 'FORMATION', round: 1 }
    });
    assert.equal(changed.phase, 'FORMATION');
    assert.equal(changed.revision, 3);
    assert.deepEqual((await store.listEvents(db, created.communityId)).map((event) => event.type), [
      'COMMUNITY_CREATED', 'MEMBER_RECRUITED', 'MEMBER_RECRUITED', 'PHASE_CHANGED'
    ]);

    await assert.rejects(
      () => store.appendEvent(db, { communityId: created.communityId, type: 'UNLISTED_EVENT' }),
      (error) => error.code === 'BIOCENOSE_EVENT_INVALID'
    );
    await assert.rejects(
      () => db.run('UPDATE biocenose_events SET payload_json = ? WHERE community_id = ?', '{}', created.communityId),
      /append-only/
    );

    const prepared = await biocenose.prepareCommunity({
      db,
      orchestratorId: 'orchestrator-2',
      mission: 'Persist this community.',
      options: { missionId: 'mission-2' }
    });
    const preparedSession = await store.loadSession(db, prepared.communityId);
    assert.equal(preparedSession.missionId, 'mission-2');
    assert.equal(preparedSession.members.length, 4);
    console.log('Biocenose session store checks: PASS');
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error('Biocenose session store checks failed:', error);
  process.exitCode = 1;
});
