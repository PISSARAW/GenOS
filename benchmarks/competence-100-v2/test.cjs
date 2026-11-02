'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= require('node:crypto').randomBytes(32).toString('hex');
const test = require('node:test');
const assert = require('node:assert/strict');
const learning = require('../../backend/src/services/experienceCompetence/learning');
const interpreter = require('../../backend/src/services/experienceCompetence/interpreter');
const contract = require('../../backend/src/services/experienceCompetence/contract');
const meta = require('./metacognition.cjs');
const agent = require('./agent.cjs');
const forecasts = require('../../backend/src/services/metacognitiveForecastService');
const F = 'op_aabbccdd';
const G = 'op_11223344';
const UNKNOWN = 'op_deadbeef';

function observation(input) {
  return meta.signObservation({ agentId: 'experienced', runId: input.runId, op: input.op || F,
    x: input.x, y: input.y, forecast: 0.8, correct: true, directory: 'synthetic-unit-test' });
}

function trained(op, rule) {
  let state = learning.initial();
  for (const x of [-12, -11, -10]) state = learning.observe(state,
    observation({ runId: op + x, op, x, y: rule.a * x + rule.b }), meta.verifierDigest());
  return learning.consider(state, { op, proposal: rule, sourceRef: 'a'.repeat(64) });
}

test('only evidenced model proposals become consolidated executable procedures', () => {
  let state = trained(F, { a: 3, b: 1 });
  assert.equal(state.procedures[F].consolidation.consolidated, true);
  assert.equal(state.procedures[F].support, 3);
  const wrong = learning.consider(state, { op: F, proposal: { a: 99, b: 1 }, sourceRef: 'b'.repeat(64) });
  assert.deepEqual(wrong.procedures[F], state.procedures[F]);
  assert.equal(wrong.proposals.at(-1).accepted, false);
  const noModel = learning.consider({ ...state, procedures: {} }, { op: F, proposal: null, sourceRef: 'b'.repeat(64) });
  assert.deepEqual(noModel.procedures, {});
  assert.throws(() => learning.consider(state, { op: F, proposal: { a: 3, b: 1 } }), /Bound model/);
});

test('coverage vetoes mixed known-unknown expressions independently of model confidence', () => {
  const state = trained(F, { a: 3, b: 1 });
  const expression = { op: UNKNOWN, value: { op: F, value: 329 } };
  const prediction = agent.prepare(state, expression);
  assert.equal(prediction.probability, 0);
  assert.equal(prediction.abstain, true);
  assert.deepEqual(agent.execute(state, expression, prediction).missing, [UNKNOWN]);
  assert.equal(agent.execute(state, expression, prediction).answer, null);
});

test('bounded interpreter composes admitted rules with exact arithmetic', () => {
  const f = trained(F, { a: 3, b: 1 });
  const g = trained(G, { a: 4, b: -4 });
  const state = { ...f, procedures: { ...f.procedures, ...g.procedures }, observations: { ...f.observations, ...g.observations } };
  const result = interpreter.execute(state, { op: G, value: { op: F, value: 346 } });
  assert.equal(result.answer, 4152);
  assert.equal(result.abstain, false);
  assert.throws(() => interpreter.chain({ op: '__proto__', value: 1 }), /grammar/);
  const cycle = { op: F }; cycle.value = cycle;
  assert.throws(() => interpreter.chain(cycle), /grammar/);
  assert.throws(() => interpreter.execute(state, { op: F, value: 1e12 }), /budget/);
});

test('every late episode changes support and evidence-based confidence', () => {
  let state = learning.initial();
  let earlier;
  for (let i = 0; i < 100; i++) {
    state = learning.consider(state, { op: F, proposal: { a: 3, b: 1 }, sourceRef: 'a'.repeat(64) });
    state = learning.observe(state, observation({ runId: 'late-' + i, x: i, y: 3 * i + 1 }), meta.verifierDigest());
    if (i === 87) earlier = interpreter.forecast(state, { op: F, value: 137 }).probability;
  }
  assert.equal(state.version, 100);
  assert.equal(state.procedures[F].support, 100);
  assert.equal(state.procedures[F].evidenceRefs.length, 100);
  assert.equal(state.calibration.count, 100);
  assert.ok(interpreter.forecast(state, { op: F, value: 137 }).probability > earlier);
});

test('forged observations, conflicting replays and contradictions fail closed', () => {
  const signed = observation({ runId: 'receipt', x: -12, y: -35 });
  assert.throws(() => learning.observe(learning.initial(), { ...signed, y: 999 }, meta.verifierDigest()), /signed/);
  assert.throws(() => learning.observe(learning.initial(), { ...signed, correct: false }, meta.verifierDigest()), /signed/);
  const first = learning.observe(learning.initial(), signed, meta.verifierDigest());
  assert.equal(learning.observe(first, signed, meta.verifierDigest()).version, 1);
  let state = trained(F, { a: 3, b: 1 });
  state = learning.observe(state, observation({ runId: 'contradiction', x: 10, y: 999 }), meta.verifierDigest());
  assert.equal(state.procedures[F], undefined);
  assert.equal(interpreter.execute(state, { op: F, value: 137 }).abstain, true);
});

test('durable state binds signatures to the agent and detects altered contents', async () => {
  const db = await agent.connect(':memory:');
  try {
    const state = trained(F, { a: 3, b: 1 });
    await agent.store.save(db, 'experienced', state);
    assert.deepEqual(await agent.store.load(db, agent.binding('experienced')), state);
    const row = await db.get('SELECT payload_json FROM adaptive_state WHERE scope=?', agent.store.SCOPE);
    const modified = JSON.parse(row.payload_json); modified.state.version++;
    await db.run('UPDATE adaptive_state SET payload_json=? WHERE scope=?', JSON.stringify(modified), agent.store.SCOPE);
    await assert.rejects(agent.store.load(db, agent.binding('experienced')), /integrity/);
  } finally { await db.close(); }
});

test('production forecasts are immutable and calibration affects the abstention floor', async () => {
  const db = await agent.connect(':memory:');
  try {
    for (let i = 0; i < 10; i++) {
      await meta.capture(db, { runId: 'cal-' + i, agentId: 'experienced', probability: 0.95 });
      await meta.observe(db, { runId: 'cal-' + i, agentId: 'experienced', correct: false, directory: 'synthetic-unit-test' });
    }
    await assert.rejects(forecasts.capture(db, { runId: 'cal-0', agentId: 'experienced', probability: 0.1 }), /immutable/);
    const measured = await meta.runBench(db, 'experienced', {});
    assert.equal(measured.status, 'measured');
    assert.equal(measured.trials, 10);
    assert.ok(measured.brier > 0.9);
    assert.equal(agent.abstention.floorFor(measured, 0.5), 0.8);
    const state = trained(F, { a: 3, b: 1 });
    assert.equal(agent.prepare(state, { op: F, value: 137 }, 0.9).abstain, true);
  } finally { await db.close(); }
});
