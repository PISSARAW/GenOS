'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, enroll, occupancy, pause } = require('./regulationFixture');
const regulator = require('../../src/services/nervous/regulationRuntime');
const policies = require('../../src/services/nervous/regulationPolicy');
const controls = require('../../src/services/nervous/admissionControl');
const garage = require('../../src/services/workerGarageService');

test('native Garage sampling records actual occupancy, queue counts, original time and GNS receipt', async t => {
  const h = await fixture(t);
  await occupancy(h, 3);
  const result = await regulator.sampleManager(h.db, 'orch');
  assert.equal(result.sample.occupied, 3); assert.equal(result.sample.capacity, 5);
  assert.equal(result.sample.pressure, 0.6); assert.equal(result.sample.queued, 0);
  const [saved] = await h.journal.samples(h.scope, 'orch');
  assert.equal(saved.observedAt, result.sample.observedAt);
  const history = await h.runtime.store.history(h.scope);
  assert.equal(history[0].signal.observedAt, saved.observedAt);
  assert.equal(history[0].signal.coverage, null);
  assert.equal((await h.journal.episodes(h.scope, 'orch')).length, 0);
});

test('a signed policy installs a bounded hold enforced by the real reservation path', async t => {
  const h = await fixture(t);
  await enroll(h, { highThreshold: 0.8 }); await occupancy(h, 4);
  await regulator.sampleManager(h.db, 'orch');
  const [episode] = await h.journal.episodes(h.scope, 'orch');
  assert.equal(episode.status, 'EXECUTED_UNVERIFIED');
  const hold = await controls.read(h.db, episode.effect_id);
  assert.ok(hold.expires_at - hold.created_at <= 15000);
  await assert.rejects(garage.reserveSlot(h.db, { orchestratorId: 'orch', workerId: 'worker-5',
    name: 'pending', role: 'implementation', mission: 'bounded' }), { code: 'GNS_ADMISSION_INHIBITED' });
  assert.equal((await h.db.get("SELECT count(*) AS n FROM agents WHERE status='running' AND execution_mode='worker'")).n, 4);
  assert.equal((await h.journal.episodes(h.scope, 'orch'))[0].denied_count, 1);
});

test('three fresh post-action measurements yield operational recovery without business or causal success', async t => {
  const h = await fixture(t);
  await enroll(h, { highThreshold: 0.8 }); await occupancy(h, 4);
  await regulator.sampleManager(h.db, 'orch');
  await occupancy(h, 1);
  for (let i = 0; i < 3; i += 1) { await pause(1050); await regulator.sampleManager(h.db, 'orch'); }
  const [row] = await h.journal.episodes(h.scope, 'orch');
  assert.equal(row.status, 'RECOVERY_OBSERVED');
  const verdict = JSON.parse(row.verdict_json);
  assert.equal(verdict.causalAttribution, 'NOT_ESTABLISHED');
  assert.equal(verdict.businessSuccess, 'NOT_EVALUATED');
  assert.equal(verdict.afterSampleIds.length, 3);
});

test('unsigned, stale, cross-scope and revoked authority cannot install or retain admission control', async t => {
  const h = await fixture(t);
  const bad = { scope: h.scope, managerId: 'orch', actorId: 'orch', expiresAt: Date.now() + 60000 };
  await assert.rejects(policies.enroll(h.db, bad), /authorization/);
  await assert.rejects(enroll(h, { scope: { ...h.scope, organizationId: 'other' } }), /SCOPE_MISMATCH/);
  await enroll(h, { highThreshold: 0.8 }); await occupancy(h, 4);
  await regulator.sampleManager(h.db, 'orch');
  await enroll(h, { expectedVersion: 1, enabled: false });
  await garage.reserveSlot(h.db, { orchestratorId: 'orch', workerId: 'worker-5', name: 'admitted', role: 'implementation', mission: 'bounded' });
  assert.equal((await garage.state(h.db, 'orch')).occupied, 5);
});

test('observe mode and disabled GNS never execute holds', async t => {
  const h = await fixture(t);
  await enroll(h, { highThreshold: 0.8 }); await occupancy(h, 4);
  process.env.GENOS_NERVOUS_REGULATION = 'observe';
  await regulator.sampleManager(h.db, 'orch');
  assert.equal((await h.journal.episodes(h.scope, 'orch')).length, 0);
  process.env.GENOS_NERVOUS_ENABLED = '0';
  assert.equal((await regulator.sampleManager(h.db, 'orch')).status, 'DISABLED');
  await garage.reserveSlot(h.db, { orchestratorId: 'orch', workerId: 'worker-5', name: 'allowed', role: 'implementation', mission: 'bounded' });
});

test('a temporary limit admits new work when actual occupancy falls below its ceiling', async t => {
  const h = await fixture(t);
  await enroll(h, { highThreshold: 0.8 }); await occupancy(h, 4);
  await regulator.sampleManager(h.db, 'orch');
  await h.db.run("UPDATE agents SET status='idle' WHERE id='worker-4'");
  await garage.reserveSlot(h.db, { orchestratorId: 'orch', workerId: 'worker-5',
    name: 'refill', role: 'implementation', mission: 'bounded' });
  assert.equal((await garage.state(h.db, 'orch')).occupied, 4);
  await assert.rejects(garage.reserveSlot(h.db, { orchestratorId: 'orch', workerId: 'worker-6',
    name: 'deferred', role: 'implementation', mission: 'bounded' }), { code: 'GNS_ADMISSION_INHIBITED' });
});

test('pending native samples replay with original timestamps and sampling cadence is enforced transactionally', async t => {
  const h = await fixture(t); await occupancy(h, 2);
  const sensor = require('../../src/services/nervous/garageSensor');
  const pending = await sensor.sample(h.db, 'orch');
  await h.journal.append(pending);
  await regulator.sampleManager(h.db, 'orch');
  const history = await h.runtime.store.history(h.scope);
  assert.equal(history[0].signal.eventId, pending.id);
  assert.equal(history[0].signal.observedAt, pending.observedAt);
  const colliding = await sensor.sample(h.db, 'orch');
  colliding.observedAt = pending.observedAt + 1;
  assert.equal(await h.journal.append(colliding), false);
  assert.equal((await h.journal.samples(h.scope, 'orch')).length, 1);
});

test('a signed threshold below the generic alert threshold produces a measured regulatory reflex', async t => {
  const h = await fixture(t); await enroll(h, { highThreshold: 0.7 });
  garage.setDynamicCapacity('orch', 4);
  await h.db.run("UPDATE garage_domains SET active_capacity=4 WHERE manager_id='orch'");
  await occupancy(h, 3);
  const observed = await regulator.sampleManager(h.db, 'orch');
  assert.equal(observed.result.receipt.policyVersion, 'gns-2');
  const [episode] = await h.journal.episodes(h.scope, 'orch');
  assert.equal(episode.status, 'EXECUTED_UNVERIFIED');
  assert.equal(JSON.parse(episode.body_json).baseline.pressure, 0.75);
  const effect = JSON.parse((await h.runtime.store.effect(episode.effect_id, h.scope)).body);
  assert.equal(effect.pathway, 'REGULATORY_REFLEX');
});
