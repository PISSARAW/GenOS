'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, evidence } = require('./continuousExecutionFixture');
const observer = require('../src/services/continuousExecution/observer');
const bridge = require('../src/services/continuousExecution/runtimeBridge');
const policy = require('../src/services/continuousExecution/policy');
const dependencies = require('../src/services/continuousExecution/dependencies');
const sensorium = require('../src/services/perception/sensoriumService');
const { workerEvidenceRounds } = require('../src/services/agentOrchestrationState');

function awaitPercept(ctx, changeWorld) {
  const previousEmit = ctx.emitTracked;
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      ctx.emitTracked = previousEmit;
      reject(new Error('No autonomous observation within 3 seconds.'));
    }, 3000);
    ctx.emitTracked = (...args) => {
      previousEmit(...args);
      if (args[0] !== 'PERCEPTION_OBSERVED') return;
      clearTimeout(deadline);
      ctx.emitTracked = previousEmit;
      resolve(args[3].observation);
    };
    changeWorld();
  });
}

test('continuous execution is opt-in and its configuration is bounded', async () => {
  assert.equal(await observer.create({}), null);
  assert.throws(() => policy.normalize({ mode: 'invented' }));
  assert.throws(() => policy.normalize({ mode: 'control', maxScans: -1 }));
  assert.throws(() => policy.normalize({ mode: 'control', intervalMs: 1 }));
  assert.throws(() => policy.normalize({ mode: 'control', maxPendingWrites: 1000 }));
  assert.throws(() => policy.normalize({ mode: 'observe', intervalMs: 100, observationWindowMs: 100 }));
});

test('timer perceives an external change during a mission without a manual scan', async () => {
  const f = await fixture({ intervalMs: 100 });
  sensorium.clearSensorium(f.ctx.agentId);
  try {
    bridge.start(f.ctx);
    const first = await awaitPercept(f.ctx, () => f.change('first external change'));
    const second = await awaitPercept(f.ctx, () => f.change('second external change'));

    assert.equal(first.data.executionRunId, 'run-1');
    assert.equal(first.data.planRevision, 1);
    assert.equal(second.data.planRevision, 2);
    assert.notEqual(first.data.digest, second.data.digest);
    assert.equal(sensorium.getSensorium('worker').observations.length, 2);
    assert.equal(f.ctx.continuousObserver.state.invalidated, true);
    assert.equal(bridge.capabilities(f.ctx).livePlanUpdate, false);
    assert.equal(bridge.guard(f.ctx, evidence()).eventType, 'AGENT_HALTED');
  } finally {
    await f.close();
    sensorium.clearSensorium(f.ctx.agentId);
  }
});

test('unchanged dependencies permit evidence; completion waits for the final scan', async () => {
  const f = await fixture();
  try {
    assert.equal(bridge.guard(f.ctx, evidence()).eventType, 'EVIDENCE_REPORT');
    const pending = bridge.guard(f.ctx, { eventType: 'AGENT_COMPLETED', payload: {} });
    assert.equal(pending.eventType, 'CONTINUOUS_COMPLETION_PENDING');
    await bridge.close(f.ctx);
    assert.equal(bridge.guard(f.ctx, { eventType: 'AGENT_COMPLETED', payload: {} }).eventType, 'AGENT_COMPLETED');
  } finally { await f.close(); }
});

test('a changed input blocks old success and a forged revision cannot authorize it', async () => {
  const f = await fixture();
  try {
    f.change('contradictory observation');
    const result = bridge.guard(f.ctx, evidence({ planRevision: 999, eligible: true }));
    assert.equal(result.eventType, 'AGENT_HALTED');
    assert.equal(result.status, 'unverified');
    assert.equal(result.payload.failure.reason, 'plan_dependencies_changed');
    assert.equal(result.payload.historicalResult.evidenceReport.outcome, 'success');
    assert.equal(f.ctx.state.missionDomainState.unverified, true);
    assert.equal(f.ctx.continuousObserver.state.planRevision, 1);
    assert.equal(bridge.guard(f.ctx, evidence()).eventType, 'AGENT_HALTED');
  } finally { await f.close(); }
});

test('shadow observation records a would-reject verdict without changing the result', async () => {
  const f = await fixture({ mode: 'observe' });
  try {
    f.change('new assumption');
    const result = bridge.guard(f.ctx, evidence());
    assert.equal(result.eventType, 'EVIDENCE_REPORT');
    assert.equal(result.payload.continuousExecution.wouldReject, true);
    assert.equal(f.ctx.state.missionDomainState.hasDomainFailure, false);
  } finally { await f.close(); }
});

test('unchanged scans coalesce and an input reverting does not restore an old plan', async () => {
  const f = await fixture();
  try {
    f.change('changed');
    observer.scan(f.ctx.continuousObserver);
    observer.scan(f.ctx.continuousObserver);
    assert.equal(f.ctx.continuousObserver.state.planRevision, 1);
    f.change('initial assumption');
    observer.scan(f.ctx.continuousObserver);
    assert.equal(f.ctx.continuousObserver.state.planRevision, 2);
    assert.equal(bridge.guard(f.ctx, evidence()).eventType, 'AGENT_HALTED');
  } finally { await f.close(); }
});

test('late invalidation revokes a previously accepted dossier for the exact run', async () => {
  const f = await fixture();
  const report = evidence().payload.evidenceReport;
  workerEvidenceRounds.set('parent', { events: new Map([['worker', [
    { executionRunId: 'run-1', evidenceReport: report },
    { executionRunId: 'run-other', evidenceReport: report }
  ]]]) });
  try {
    f.ctx.state.missionDomainState = { unverified: false, domainVerdict: 'completed', hasDomainFailure: false };
    f.change('late invalidation');
    await bridge.close(f.ctx);
    const entries = workerEvidenceRounds.get('parent').events.get('worker');
    assert.equal(entries[0].evidenceReport, undefined);
    assert.deepEqual(entries[0].historicalEvidenceReport, report);
    assert.equal(entries[0].failure.category, 'stale_plan');
    assert.deepEqual(entries[1].evidenceReport, report);
    assert.equal(f.ctx.state.missionDomainState.domainVerdict, 'unverified');
  } finally { workerEvidenceRounds.delete('parent'); await f.close(); }
});

test('observation and final verification budgets are separate and fail closed', async () => {
  const f = await fixture({ maxScans: 1, maxVerifications: 1 });
  try {
    assert.equal(observer.scan(f.ctx.continuousObserver).eligible, true);
    assert.equal(bridge.guard(f.ctx, evidence()).eventType, 'EVIDENCE_REPORT');
    assert.equal(bridge.guard(f.ctx, evidence()).payload.failure.reason, 'observation_budget_exhausted');
  } finally { await f.close(); }
});

test('a polling budget cannot silently disable coverage', async () => {
  const f = await fixture({ maxScans: 1 });
  try {
    observer.scan(f.ctx.continuousObserver);
    observer.scan(f.ctx.continuousObserver);
    assert.equal(bridge.guard(f.ctx, evidence()).payload.failure.reason, 'observation_budget_exhausted');
  } finally { await f.close(); }
});

test('persistence failure and write queue overflow prevent positive evidence', async () => {
  const f = await fixture({ maxPendingWrites: 1 });
  const original = f.ctx.continuousObserver.store.persistObject;
  try {
    f.ctx.continuousObserver.store.persistObject = async () => { throw new Error('storage unavailable'); };
    f.change('changed');
    observer.scan(f.ctx.continuousObserver);
    observer.persist(f.ctx.continuousObserver);
    await f.ctx.continuousObserver.pending;
    assert.equal(f.ctx.continuousObserver.state.coverageFailure, 'observation_queue_overflow');
    assert.equal(bridge.guard(f.ctx, evidence()).payload.failure.reason, 'observation_persistence_failed');
  } finally { f.ctx.continuousObserver.store.persistObject = original; await f.close(); }
});

test('observation state is durably bound to its run and remains historical after close', async () => {
  const f = await fixture();
  try {
    f.change('changed');
    observer.scan(f.ctx.continuousObserver);
    await bridge.close(f.ctx);
    const row = await f.db.get("SELECT payload_json FROM adaptive_state WHERE scope = 'continuous_execution' AND key = 'run-1'");
    const state = JSON.parse(row.payload_json);
    assert.equal(state.closed, true);
    assert.equal(state.invalidated, true);
    assert.equal(state.observations[0].runId, 'run-1');
    assert.equal(state.observations[0].outcome, 'observed');
    assert.equal(state.observations[0].digest.length, 64);
  } finally { await f.close(); }
});

test('cross-run evidence is rejected and negative evidence remains a failure', async () => {
  const f = await fixture();
  try {
    assert.equal(bridge.guard(f.ctx, evidence({ executionRunId: 'run-other' })).payload.failure.reason, 'execution_run_mismatch');
    f.change('changed');
    const failure = { eventType: 'EVIDENCE_REPORT', payload: { evidenceReport: { outcome: 'failed' } } };
    assert.equal(bridge.guard(f.ctx, failure).payload.evidenceReport.outcome, 'failed');
  } finally { await f.close(); }
});

test('path escape, large files and replaced directories cannot become observations', async () => {
  const f = await fixture();
  try {
    assert.throws(() => dependencies.resolveDependencies(f.directory, ['../outside']));
    assert.throws(() => dependencies.resolveDependencies(f.directory, [f.directory]));
    assert.throws(() => dependencies.resolveDependencies(f.directory, Array.from({ length: 17 }, (_, i) => `${i}`)));
    fs.writeFileSync(path.join(f.directory, 'input.txt'), Buffer.alloc(dependencies.MAX_BYTES + 1));
    assert.equal(bridge.guard(f.ctx, evidence()).payload.failure.reason, 'dependency_observation_failed');
  } finally { await f.close(); }
});

test('deletion produces a sourced observation and invalidates the current plan', async () => {
  const f = await fixture();
  try {
    fs.unlinkSync(path.join(f.directory, 'input.txt'));
    assert.equal(bridge.guard(f.ctx, evidence()).eventType, 'AGENT_HALTED');
    assert.equal(f.ctx.continuousObserver.state.observations[0].digest, 'missing');
  } finally { await f.close(); }
});
