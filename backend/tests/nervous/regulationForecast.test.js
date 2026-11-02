'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { forecast, calibrate } = require('../../src/services/nervous/regulationForecast');
const { fixture, enroll, occupancy, pause } = require('./regulationFixture');
const regulator = require('../../src/services/nervous/regulationRuntime');
const { harness, SCOPE, event, NOW } = require('./helpers');

function samples() {
  return [3, 2, 1].map(index => ({ id: `sample-${index}`, managerId: 'orch', capacity: 5,
    scope: SCOPE, pressure: index / 5, observedAt: NOW + index * 1000 }));
}
const policy = { horizonMs: 5000, highThreshold: 0.9, version: 1 };

test('a bounded forecast remains explicitly predicted and disappears with insufficient or stale samples', () => {
  const prediction = forecast(samples(), policy);
  assert.equal(prediction.pressure, 1); assert.equal(prediction.evidenceStatus, 'PREDICTED_UNVERIFIED');
  assert.equal(forecast(samples().slice(0, 2), policy), null);
  const stale = samples(); stale[2].observedAt -= 31000;
  assert.equal(forecast(stale, policy), null);
  const changed = samples(); changed[0].capacity = 6;
  assert.equal(forecast(changed, policy), null);
});

test('forecast supplied as telemetry payload cannot manufacture a predictive reflex', async t => {
  const h = await harness(); t.after(() => h.store.close());
  await h.runtime.ingest(event('forged-forecast', { payload: { resourcePressure: 0.6,
    regulationForecast: forecast(samples(), policy) } }), SCOPE);
  assert.equal((await h.store.effects(SCOPE)).length, 0);
});

test('actual rising Garage occupancy triggers a signed predictive hold before the measured alert threshold', async t => {
  const h = await fixture(t); await enroll(h, { predictiveHold: true, horizonMs: 10000 });
  await require('../../src/services/garageQueueStore').enqueuePersistent(h.db,
    require('../garageFixture').request({ workerId: 'worker-5' }));
  for (let i = 1; i <= 3; i += 1) {
    await occupancy(h, i); await regulator.sampleManager(h.db, 'orch');
    if (i < 3) await pause(1050);
  }
  const [episode] = await h.journal.episodes(h.scope, 'orch');
  assert.equal(episode.status, 'EXECUTED_UNVERIFIED');
  const body = JSON.parse(episode.body_json);
  assert.equal(body.baseline.pressure, 0.6);
  assert.equal(body.baseline.forecast.evidenceStatus, 'PREDICTED_UNVERIFIED');
  const effect = JSON.parse((await h.runtime.store.effect(episode.effect_id, h.scope)).body);
  assert.equal(effect.pathway, 'PREDICTIVE_REFLEX');
  const cycle = await require('../../src/services/agow/workspaceCycleService').cycle({ db: h.db,
    agentId: 'orch', now: Date.now(), ignitionThreshold: 100 });
  const candidate = cycle.arbitration.selected[0];
  assert.match(candidate.content.compactPreview, /PREDICTED_UNVERIFIED/);
  assert.equal(candidate.measures.causalConfidence, 0);
  assert.ok(candidate.evidenceRefs.includes(`gns:garage-sample:${body.baseline.id}`));
});

test('calibration is bounded, requires enough completed episodes and cannot replace signed authority', () => {
  assert.equal(calibrate(policy, []).status, 'INSUFFICIENT_EVIDENCE');
  const calibrated = { ...policy, highThreshold: 0.94, scope: SCOPE, managerId: 'orch' };
  const episodes = Array.from({ length: 10 }, (_, i) => ({ effect_id: `effect-${i}`, status: 'REGRESSED',
    body_json: JSON.stringify({ policy: calibrated }) }));
  const proposal = calibrate(calibrated, episodes);
  assert.equal(proposal.highThreshold, 0.95); assert.equal(proposal.automaticApply, false);
  assert.equal(proposal.requiresNewSignedPolicy, true);
  assert.equal(proposal.causalAttribution, 'NOT_ESTABLISHED');
  assert.equal(calibrate({ ...calibrated, version: 2 }, episodes).status, 'INSUFFICIENT_EVIDENCE');
});

test('a forecast without a native queued demand remains advisory even under a predictive policy', async t => {
  const h = await fixture(t); await enroll(h, { predictiveHold: true, horizonMs: 10000, highThreshold: 0.7 });
  for (let i = 1; i <= 3; i += 1) {
    await occupancy(h, i); await regulator.sampleManager(h.db, 'orch');
    if (i < 3) await pause(1050);
  }
  const [sample] = await h.journal.samples(h.scope, 'orch');
  assert.ok(sample.forecast.pressure >= 0.7);
  assert.equal((await h.journal.episodes(h.scope, 'orch')).length, 0);
});
