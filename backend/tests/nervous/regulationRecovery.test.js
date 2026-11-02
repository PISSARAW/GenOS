'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, enroll, occupancy, pause } = require('./regulationFixture');
const regulator = require('../../src/services/nervous/regulationRuntime');
const controls = require('../../src/services/nervous/admissionControl');
const bridge = require('../../src/services/nervous/runtimeBridge');
const { RegulationJournal } = require('../../src/services/nervous/regulationJournal');
const dispatcher = require('../../src/services/garageQueueDispatcher');
const queue = require('../../src/services/garageQueueStore');
const { request } = require('../garageFixture');

async function applied(t) {
  const h = await fixture(t);
  await enroll(h, { highThreshold: 0.8 }); await occupancy(h, 4);
  await regulator.sampleManager(h.db, 'orch');
  h.episode = (await h.journal.episodes(h.scope, 'orch'))[0];
  return h;
}

test('a claimed effect with a durable hold is reconciled after SQLite reopen without re-execution', async t => {
  const h = await applied(t);
  const original = await controls.read(h.db, h.episode.effect_id);
  await h.runtime.store.serial(() => h.runtime.store.db.exec(`UPDATE nervous_effects SET status='CLAIMED',outcome=NULL;
    UPDATE nervous_regulation_episodes SET status='PREPARED',verdict_json=NULL;`));
  await h.runtime.store.close(); bridge.runtimes.delete(h.db);
  await pause(1050); await regulator.sampleManager(h.db, 'orch');
  h.runtime = await bridge.getRuntime(h.db);
  h.journal = await new RegulationJournal(h.runtime.store).initialize();
  assert.deepEqual(await controls.read(h.db, h.episode.effect_id), original);
  assert.equal((await h.runtime.store.effect(h.episode.effect_id, h.scope)).status, 'EXECUTED_UNVERIFIED');
  assert.equal((await h.journal.episodes(h.scope, 'orch')).length, 1);
  assert.equal((await h.journal.episodes(h.scope, 'orch'))[0].status, 'EXECUTED_UNVERIFIED');
});

test('a claim without a persisted effect remains uncertain and is not automatically retried', async t => {
  const h = await applied(t);
  await h.db.run('DELETE FROM gns_admission_holds');
  await h.runtime.store.serial(() => h.runtime.store.db.exec(`UPDATE nervous_effects SET status='CLAIMED';
    UPDATE nervous_regulation_episodes SET status='PREPARED';`));
  await pause(1050); await regulator.sampleManager(h.db, 'orch');
  assert.equal((await h.journal.episodes(h.scope, 'orch'))[0].status, 'UNCERTAIN');
  assert.equal((await h.db.get('SELECT count(*) AS n FROM gns_admission_holds')).n, 0);
});

test('queue regression releases only the matching hold and disables further actions under that policy version', async t => {
  const h = await applied(t);
  await queue.enqueuePersistent(h.db, request({ workerId: 'worker-5' }));
  await h.db.run("UPDATE garage_queue SET created_at=datetime('now','-30 seconds')");
  await pause(1050); await regulator.sampleManager(h.db, 'orch');
  const episodes = await h.journal.episodes(h.scope, 'orch');
  assert.equal(episodes.length, 1); assert.equal(episodes[0].status, 'REGRESSED');
  assert.ok((await controls.read(h.db, h.episode.effect_id)).released_at);
  assert.equal(JSON.parse(episodes[0].verdict_json).rollback, true);
});

test('queued requests remain queued under GNS backpressure and no runtime is launched', async t => {
  const h = await applied(t);
  const row = await queue.enqueuePersistent(h.db, request({ workerId: 'worker-5' }));
  const result = await dispatcher.drainOne({ db: h.db, orchestratorId: 'orch',
    startMission: async () => assert.fail('an inhibited reservation must not start a mission') });
  assert.equal(result.started, false); assert.equal(result.queued, true);
  assert.equal(result.error, 'GNS_ADMISSION_INHIBITED');
  assert.equal((await h.db.get('SELECT status FROM garage_queue WHERE request_id=?', row.request_id)).status, 'queued');
});

test('expired holds and replaced policies cannot keep reservations inhibited', async t => {
  const h = await applied(t);
  await h.db.run('UPDATE gns_admission_holds SET expires_at=?', Date.now() - 1);
  await controls.assertAdmission(h.db, { orchestratorId: 'orch' });
  await enroll(h, { expectedVersion: 1, enabled: false });
  await pause(1050); await regulator.sampleManager(h.db, 'orch');
  assert.equal((await h.journal.episodes(h.scope, 'orch'))[0].status, 'REVOKED');
});

test('an unavailable authority lookup is not classified as an explicit revocation', async t => {
  const h = await applied(t);
  const original = h.db.get.bind(h.db);
  h.db.get = async (sql, ...params) => {
    if (sql.includes('FROM shev_responsibilities')) throw new Error('transient authority I/O failure');
    return original(sql, ...params);
  };
  try {
    await pause(1050);
    await assert.rejects(regulator.sampleManager(h.db, 'orch'), /transient authority I\/O/);
    assert.equal((await h.journal.episodes(h.scope, 'orch'))[0].status, 'EXECUTED_UNVERIFIED');
    assert.equal((await controls.read(h.db, h.episode.effect_id)).released_at, null);
  } finally { h.db.get = original; }
});

test('explicit project authority revocation immediately removes the right to inhibit new reservations', async t => {
  const h = await applied(t);
  await h.db.run("UPDATE shev_responsibilities SET status='retired'");
  await controls.assertAdmission(h.db, { orchestratorId: 'orch' });
});
