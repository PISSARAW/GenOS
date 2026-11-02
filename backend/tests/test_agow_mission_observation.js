'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./helpers/agowMissionFixture');
const workspace = require('../src/services/globalWorkspaceService');
const observations = require('../src/services/agow/missionObservationService');
const bridge = require('../src/services/agow/missionObservationRuntimeBridge');

async function setup(t, suffix) {
  const db = await fixture.database();
  t.after(() => db.close());
  return fixture.mission(db, suffix);
}

function install(t, ctx, verifier) {
  const release = workspace.configureRuntime({ db: ctx.db, agentId: ctx.agentId,
    missionOutcomeVerifier: verifier, missionOutcomeTimeoutMs: ctx.missionOutcomeTimeoutMs });
  t.after(release);
}

test('terminal success and a forged verified payload remain pending without a host verifier', async (t) => {
  const { ctx, record, event } = await setup(t, 'reported');
  assert.equal(record.status, 'awaiting_outcome');
  event.payload.verified = true;
  event.payload.realizedLoss = 0;
  const outcome = await bridge.observe(ctx, event);
  assert.equal(outcome.status, 'verification_pending');
  assert.equal(outcome.observation.reason, 'verifier_unavailable');
  assert.equal(outcome.observation.metrics, undefined);
});

test('verified observations retain the earlier decision, unknown metrics and idempotent replay', async (t) => {
  const { ctx, record, event } = await setup(t, 'verified');
  let calls = 0;
  install(t, ctx, async (input) => { calls++; return fixture.verified(input); });
  const result = await bridge.observe(ctx, event);
  assert.equal(result.status, 'verified');
  assert.equal(result.binding.frameId, record.binding.frameId);
  assert.equal(result.observation.metrics.resourceReserve, null);
  assert.equal(result.observation.predictionError, 0.2 - record.binding.predictedLoss);
  assert.equal(result.policyUpdated, false);
  assert.equal(result.promotionAllowed, false);
  assert.deepEqual(await bridge.observe(ctx, event), result);
  assert.equal(calls, 1);
  const cognitive = await require('../src/services/agow/cognitiveModeExperienceService').load(ctx);
  assert.equal(cognitive.state.receipts[0].realizedLoss, null);
  await assert.rejects(bridge.observe(ctx, { ...event, payload: { ...event.payload, success: false } }), /outcome-conflict/);
  await assert.rejects(bridge.observe(ctx, { ...event, detail: 'different result' }), /outcome-conflict/);
});

test('verification can resume after a missing callback without mutating trusted context', async (t) => {
  const { ctx, event } = await setup(t, 'retry');
  const pending = await bridge.observe(ctx, event);
  install(t, ctx, async (input) => {
    const result = fixture.verified(input);
    input.binding.predictedLoss = 999;
    input.event.payload.success = false;
    return result;
  });
  const result = await bridge.observe(ctx, event);
  assert.equal(result.status, 'verified');
  assert.equal(result.binding.predictedLoss, pending.binding.predictedLoss);
  assert.equal(event.payload.success, true);
});

test('identity mismatches and nonterminal VERIFY events cannot consume the mission observation', async (t) => {
  const { ctx, event } = await setup(t, 'identity');
  await assert.rejects(bridge.observe(ctx, { ...event, runId: 'other-run' }), /identity-mismatch/);
  await assert.rejects(bridge.observe(ctx, { ...event, payload: { executionRunId: 'other-run' } }), /identity-mismatch/);
  assert.equal((await bridge.observe(ctx, { eventType: 'AGENT_STEP', action: 'VERIFY' })).reason, 'not_terminal');
  assert.equal((await observations.list(ctx))[0].status, 'awaiting_outcome');
});

test('wrong bindings, missing evidence and malformed measurements never become verified', async (t) => {
  const { ctx, event } = await setup(t, 'invalid');
  const metrics = fixture.verified({ binding: {}, eventIdentity: {} }).metrics;
  const invalid = [{ bindingHash: 'wrong' }, { eventDigest: 'wrong' }, { evidenceRefs: [] }, { verified: false },
    { metrics: { ...metrics, realizedLoss: null } }, { metrics: { ...metrics, blockageEvents: -1 } }];
  for (const overrides of invalid) {
    const release = workspace.configureRuntime({ db: ctx.db, agentId: ctx.agentId,
      missionOutcomeVerifier: async (input) => fixture.verified(input, overrides) });
    try { assert.equal((await bridge.observe(ctx, event)).status, 'verification_pending'); }
    finally { release(); }
  }
});

test('verifier timeout rejects late measurements and requests cooperative cancellation', async (t) => {
  const { ctx, event } = await setup(t, 'timeout');
  let aborted = false;
  install(t, { ...ctx, missionOutcomeTimeoutMs: 5 }, (input) => new Promise((resolve) => {
    input.signal.addEventListener('abort', () => { aborted = true; resolve(fixture.verified(input)); });
  }));
  const result = await bridge.observe(ctx, event);
  assert.equal(result.status, 'verification_pending');
  assert.equal(result.observation.reason, 'verifier_timeout');
  assert.equal(aborted, true);
});

test('a verifier throwing a non-Error value leaves the measurement pending', async (t) => {
  const { ctx, event } = await setup(t, 'throw-null');
  install(t, ctx, async () => { throw null; });
  assert.equal((await bridge.observe(ctx, event)).observation.reason, 'verification_failed');
});

test('bindings are scoped to connection and agent; callback types and deadlines are validated', async (t) => {
  const { ctx, event } = await setup(t, 'scope');
  install(t, { ...ctx, agentId: 'other-agent' }, async (input) => fixture.verified(input));
  assert.equal((await bridge.observe(ctx, event)).observation.reason, 'verifier_unavailable');
  assert.throws(() => workspace.configureRuntime({ ...ctx, missionOutcomeVerifier: true }), /must be callable/);
  assert.throws(() => workspace.configureRuntime({ ...ctx, missionOutcomeTimeoutMs: 0 }), /timeout/);
  assert.equal((await observations.observe({ ...ctx, runId: 'missing', event })).recorded, false);
});

test('SQLite reopen restores the binding and requires reinstalling the verifier', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agow-mission-'));
  let second;
  t.after(async () => {
    await second?.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const filename = path.join(directory, 'mission.sqlite');
  const first = await fixture.database(filename);
  const { ctx, event } = await fixture.mission(first, 'durable');
  const release = workspace.configureRuntime({ ...ctx, missionOutcomeVerifier: fixture.verified });
  await first.close();
  second = await fixture.database(filename);
  const restored = { ...ctx, db: second };
  assert.equal((await bridge.observe(restored, event)).observation.reason, 'verifier_unavailable');
  install(t, restored, async (input) => fixture.verified(input));
  const verified = await bridge.observe(restored, event);
  assert.equal(verified.status, 'verified');
  assert.deepEqual(await bridge.start(restored), verified);
  release();
});

test('concurrent conflicting terminal observations cannot overwrite the first event', async (t) => {
  const { ctx, event } = await setup(t, 'race');
  install(t, ctx, async (input) => fixture.verified(input));
  const results = await Promise.allSettled([bridge.observe(ctx, event),
    bridge.observe(ctx, { ...event, eventId: 'other-event' })]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.match(results.find((item) => item.status === 'rejected').reason.message, /outcome-conflict/);
  assert.equal((await observations.list(ctx)).length, 1);
});

test('counterfactual frames and another frame receipt cannot bind a real mission', async (t) => {
  const { ctx, record } = await setup(t, 'decision');
  const input = { db: ctx.db, ...record.binding, runId: 'another-run', decisionReceiptId: 'missing' };
  await assert.rejects(observations.start(input), /receipt-mismatch/);
  const frame = { ...ctx.agow.frame, frameId: 'simulated-frame', realityMode: 'counterfactual' };
  await require('../src/services/agow/workspaceFrameStore').save({ frame, db: ctx.db });
  await assert.rejects(observations.start({ ...input, frameId: frame.frameId }), /real-frame-required/);
});

test('replay remains idempotent after frame history expires and conflicting bindings are rejected', async (t) => {
  const { ctx, record } = await setup(t, 'expired-history');
  await require('../src/services/agow/workspaceFrameStore').clear(ctx);
  assert.deepEqual(await bridge.start(ctx), record);
  await assert.rejects(observations.start({ db: ctx.db, ...record.binding, missionId: 'different' }), /binding-conflict/);
});

test('production planning binds the decision after run creation and ingress observes it before the outcome cycle', async (t) => {
  const db = await fixture.database();
  t.after(() => db.close());
  const previousMode = process.env.GENOS_AGOW_MODE;
  process.env.GENOS_AGOW_MODE = 'bounded';
  t.after(() => {
    if (previousMode === undefined) delete process.env.GENOS_AGOW_MODE;
    else process.env.GENOS_AGOW_MODE = previousMode;
  });
  const ctx = { db, agentId: 'planning-integration', normalizedMission: { missionId: 'integration', prompt: 'aggregate orders' } };
  install(t, ctx, async (input) => fixture.verified(input));
  const runtimeRelease = workspace.configureRuntime({ db, agentId: ctx.agentId, receivers: [],
    skipTransport: true, ignitionThreshold: 0.1, missionOutcomeVerifier: fixture.verified });
  t.after(runtimeRelease);
  const transport = require('../src/services/signalingTransportService');
  const strategy = require('../src/services/strategyExecutionService');
  const budget = require('../src/services/missionModelBudgetScope');
  const preparation = require('../src/services/gqwf/missionExecution');
  t.mock.method(transport, 'publishSignal', async () => ({ published: true }));
  t.mock.method(strategy, 'createExecutionRun', async () => ({ id: 'integration-run' }));
  t.mock.method(budget, 'bindParent', async () => {});
  t.mock.method(preparation, 'prepareMissionWorkspace', async () => {});
  const planning = require('../src/services/agentRuntimeAdapter/missionPlanning');
  await planning.attachGlobalWorkspace(ctx);
  await planning.createMissionExecutionRun(ctx);
  assert.equal((await observations.list(ctx))[0].binding.decisionReceiptId, ctx.agow.modeReceipt.receiptId);
  const adapter = require('../src/services/agow/candidates/candidateAdapterService');
  t.mock.method(adapter, 'submit', async () => {
    assert.equal((await observations.list(ctx))[0].status, 'verified');
    return { accepted: false, reason: 'test_transport_unavailable' };
  });
  const result = await require('../src/services/agow/agowRuntimeIngressService').process({ ctx, finalEvent: true,
    event: { eventId: 'integration-terminal', eventType: 'AGENT_COMPLETED', payload: { executionRunId: 'integration-run' } } });
  assert.equal(result.missionObservation.status, 'verified');
  assert.equal(result.missionObservation.binding.frameId, ctx.agow.frame.frameId);
});

test('a verified failed task is measured without turning its process success into zero loss', async (t) => {
  const { ctx, event } = await setup(t, 'verified-failure');
  install(t, ctx, async (input) => fixture.verified(input, { metrics: {
    realizedLoss: 1, goalProgress: 0, resourceReserve: null,
    missionStability: null, blockageEvents: 1, viabilityViolations: 0 } }));
  const result = await bridge.observe(ctx, event);
  assert.equal(result.status, 'verified');
  assert.equal(result.observation.metrics.realizedLoss, 1);
  assert.equal(result.observation.metrics.goalProgress, 0);
  assert.equal(result.policyUpdated, false);
});

test('the separate-process worker/oracle demo is replayable and detects a substituted answer', async () => {
  const demo = await require('../../benchmarks/agow-mission/run.cjs').run();
  const { verify } = require('../../benchmarks/agow-mission/verify.cjs');
  assert.deepEqual(await verify(demo.directory), { verified: true, missions: 2, promotionAllowed: false });
  const filename = path.join(demo.directory, 'report.json');
  const original = await fs.readFile(filename, 'utf8');
  const altered = JSON.parse(original);
  altered.results[0].answer[0][1] += 1;
  try {
    await fs.writeFile(filename, JSON.stringify(altered));
    await assert.rejects(verify(demo.directory), /digest mismatch/);
  } finally { await fs.writeFile(filename, original); }
});
