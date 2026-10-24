'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'isolated-metacognition-regression';
const assert = require('node:assert/strict');
const fixture = require('./helpers/metacognitiveForecastFixture.cjs');
const forecasts = require('../src/services/metacognitiveForecastService');
const bench = require('../src/services/metacognitionBenchService');
const { AdaptiveStateService } = require('../src/services/adaptiveStateService');

async function regression(db) {
  for (let index = 0; index < 12; index++) {
    const id = 'regression-' + index;
    await fixture.capture(db, id, 0.8);
    assert.equal((await fixture.resolve(db, id, index < 6)).result.status, 'resolved');
  }
  const measured = await bench.runBench(db, 'agent', {});
  assert.equal(measured.status, 'measured');
  assert.equal(measured.brier, 0.34);
  assert.equal(measured.ece, 0.3);
  assert.equal(measured.overconfidence, 0.3);
  assert.equal(measured.type2auc, 0.5);
  assert.equal(measured.policyVersion, 2);
  assert.equal(require('../src/services/abstentionService').floorFor(measured, 0.5), 0.8);
}

async function immutablePrior(db) {
  await fixture.capture(db, 'immutable', 0.6);
  assert.equal((await forecasts.capture(db, { runId: 'immutable', agentId: 'agent', probability: 0.6 })).replayed, true);
  await assert.rejects(forecasts.capture(db, { runId: 'immutable', agentId: 'agent', probability: 0.9 }), /immutable/);
  await db.run("INSERT INTO strategy_execution_runs VALUES('too-late','agent','completed')");
  await assert.rejects(forecasts.capture(db, { runId: 'too-late', agentId: 'agent', probability: 0.9 }), /planned/);
  const resolved = await fixture.resolve(db, 'immutable', true);
  assert.equal((await forecasts.observe(db, { run: { id: 'immutable' }, event: resolved.event })).replayed, true);
  await assert.rejects(forecasts.observe(db, { run: { id: 'immutable' },
    event: fixture.signedEvent('immutable', false) }), /Conflicting/);
}

async function invalidEvidence(db) {
  await fixture.capture(db, 'unresolved', 0.8);
  await db.run("UPDATE strategy_execution_runs SET status='completed' WHERE id='unresolved'");
  const run = { id: 'unresolved' };
  const valid = fixture.signedEvent(run.id, true);
  const evidence = valid.payload.qualityEvidence;
  const invalid = [
    { ...valid, payload: { ...valid.payload, qualityEvidence: { ...evidence, success: false } } },
    { ...valid, payload: { ...valid.payload, executionRunId: 'foreign-run' } },
    fixture.signedEvent(run.id, true, { projectId: 'other-project' })
  ];
  assert.equal((await forecasts.observe(db, { run, event: { ...valid, payload: { executionRunId: run.id } } })).status, 'unavailable');
  for (const event of invalid) assert.equal((await forecasts.observe(db, { run, event })).status, 'refused');
  for (const checkedAt of ['2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z']) {
    const receipt = require('../src/services/epistemicVerifierReceiptService').issueReceipt({ ...evidence.receipt, checkedAt });
    const event = { ...valid, payload: { ...valid.payload, qualityEvidence: { ...evidence, receipt } } };
    assert.equal((await forecasts.observe(db, { run, event })).status, 'refused');
  }
  const pending = await forecasts.readTrials(db, 'agent');
  assert.equal(pending.unresolved, 1);
  assert.equal(pending.trials.length, 13);
  await db.run("UPDATE metacognitive_forecasts SET forecast_hash='tampered' WHERE run_id='unresolved'");
  assert.equal((await forecasts.readTrials(db, 'agent')).invalid, 1);
}

async function legacyIsUnscored() {
  const db = await fixture.createDb();
  try {
    const state = new AdaptiveStateService(db);
    const entries = Array.from({ length: 12 }, (_, index) => ({ causalConfidence: index < 6 ? 0.8 : 0.2,
      predictionError: index < 6 ? 0.2 : 0.8 }));
    await state.persistObject('core_self', 'agent', { entries });
    await state.persistObject('orchestrator_self_model', 'agent', { metacognitionBench: { status: 'measured', brier: 0 } });
    const result = await bench.runBench(db, 'agent', { entries });
    assert.equal(result.status, 'insufficient_data');
    assert.equal(result.trials, 0);
    assert.equal(result.brier, undefined);
    const saved = await state.restoreObject('orchestrator_self_model', 'agent');
    assert.equal(saved.metacognitionBench.policyVersion, 2);
    assert.equal(saved.metacognitionBench.status, 'insufficient_data');
    assert.equal(require('../src/services/abstentionService').floorFor({ overconfidence: 0.3 }, 0.5), 0.5);
  } finally { await db.close(); }
}

async function main() {
  const db = await fixture.createDb();
  try {
    await regression(db);
    await immutablePrior(db);
    await invalidEvidence(db);
  } finally { await db.close(); }
  await legacyIsUnscored();
  console.log('Metacognitive forecasts: non-circular Brier, frozen priors, signed outcomes, replay, legacy and scope boundaries PASS.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
