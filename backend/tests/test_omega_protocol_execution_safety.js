'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const interop = require('../src/services/cognitiveOmegaInteropService');
const { buildPlan } = require('../src/services/omegaProtocol/admissionPlan');
const { runKey } = require('../src/services/omegaProtocol/executionStore');
const fixture = require('./helpers/omegaExecutionFixture');

function customAccepted(program, capabilities) {
  const submission = { ...fixture.accepted().submission, program, requirements: { verifierRefs: [], effectGuarantees: [] } };
  return { status: 'accepted', submission, program, capabilities, context: fixture.context,
    plan: buildPlan(submission, capabilities, fixture.context) };
}

async function originalPolicyRequired() {
  const value = fixture.accepted();
  value.program.policy.read = [];
  value.plan.programDigest = interop.digest(value.program);
  const setup = fixture.setup({ accepted: value });
  try {
    await assert.rejects(setup.runtime.apply(fixture.message(value)), /original program policy denies/);
    assert.equal(setup.calls.read, 0);
    assert.equal(setup.calls.effect, 0);
  } finally { setup.runtime.close(); }
  const program = fixture.program();
  program.operations = [{ id: 'call', kind: 'CALL', reference: 'tool', dependsOn: [], state: 'open' }];
  program.policy = { call: ['tool'] };
  program.payload = { requests: { call: { resourceId: 'resource-1', action: 'publish', cost: 1 } } };
  const capabilities = { ...fixture.capabilities(), operations: [{ kind: 'CALL', references: ['tool'] }], verifierRefs: [] };
  const callValue = customAccepted(program, capabilities);
  callValue.program.policy.call = [];
  callValue.plan.programDigest = interop.digest(callValue.program);
  const callSetup = fixture.setup({ accepted: callValue, handlers: [{ kind: 'CALL', reference: 'tool' }] });
  try { await assert.rejects(callSetup.runtime.apply(fixture.message(callValue)), /original program policy denies/); }
  finally { callSetup.runtime.close(); }
}

async function revokedDuringHandler() {
  let granted = true;
  let reads = 0;
  const handlers = fixture.setup();
  handlers.runtime.close();
  handlers.handlers[0].handle = async () => { reads += 1; granted = false; return { answer: 42 }; };
  const setup = fixture.setup({ handlers: handlers.handlers, authorize: async () => granted });
  try {
    const execution = fixture.message(setup.accepted);
    await assert.rejects(setup.runtime.apply(execution), /authority rejected or revoked/);
    assert.equal(reads, 1);
    assert.equal(setup.calls.effect, 0);
    const query = { ...fixture.context, runId: 'run-1' };
    assert.equal(setup.runtime.state(query).status, 'running');
    const rows = setup.runtime.store.db.prepare('SELECT status FROM cognitive_omega_operations').all();
    assert.deepEqual(rows, [{ status: 'running' }]);
  } finally { setup.runtime.close(); }
}

async function actualInferenceOnlyWhenRequested() {
  const program = fixture.program();
  program.operations = [{ id: 'infer', kind: 'INFER', reference: 'model', dependsOn: [], state: 'open' }];
  program.policy = { infer: ['model'] };
  program.payload = { requests: { infer: { instruction: 'summarise' } } };
  const capabilities = { ...fixture.capabilities(), operations: [{ kind: 'INFER', references: ['model'] }], verifierRefs: [], effectGuarantees: [] };
  const value = customAccepted(program, capabilities);
  const setup = fixture.setup({ accepted: value });
  try {
    const result = await setup.runtime.apply(fixture.message(value));
    assert.equal(result.status, 'completed');
    assert.equal(setup.calls.infer, 1);
    await setup.runtime.apply(fixture.message(value, 'RESUME'));
    assert.equal(setup.calls.infer, 1);
  } finally { setup.runtime.close(); }
}

async function inferenceOutcomeUnknownBlocksReplay() {
  const program = fixture.program();
  program.operations = [{ id: 'infer', kind: 'INFER', reference: 'model', dependsOn: [], state: 'open' }];
  program.policy = { infer: ['model'] };
  program.payload = { requests: { infer: { instruction: 'summarise' } } };
  const capabilities = { ...fixture.capabilities(), operations: [{ kind: 'INFER', references: ['model'] }], verifierRefs: [], effectGuarantees: [] };
  const value = customAccepted(program, capabilities);
  let calls = 0;
  const setup = fixture.setup({ accepted: value, handlers: [{ kind: 'INFER', reference: 'model',
    handle: async () => { calls += 1; throw new Error('lost billed inference response'); } }] });
  try {
    const result = await setup.runtime.apply(fixture.message(value));
    assert.equal(result.status, 'recovery_required');
    const report = await setup.runtime.apply(fixture.message(value, 'REPORT_OBLIGATIONS'));
    assert.equal(report.status, 'inference_outcome_unknown');
    assert.equal(report.obligations[0].state, 'open');
    await assert.rejects(setup.runtime.apply(fixture.message(value, 'RESUME')), /INFERENCE_OUTCOME_UNKNOWN/);
    assert.equal(calls, 1);
  } finally { setup.runtime.close(); }
}

async function runConflict() {
  let current = fixture.accepted();
  const setup = fixture.setup({ accepted: current, resolvePlan: async () => current });
  try {
    await setup.runtime.apply(fixture.message(current));
    current = structuredClone(current);
    current.plan.planId = 'other-plan';
    const changed = fixture.message(current, 'REPORT_OBLIGATIONS');
    await assert.rejects(setup.runtime.apply(changed), /run binding conflict/);
    const row = setup.runtime.store.db.prepare('SELECT run_id FROM cognitive_omega_runs').get();
    assert.equal(row.run_id, runKey(setup.runtime.state({ ...fixture.context, runId: 'run-1' }).binding));
  } finally { setup.runtime.close(); }
}

async function ownershipChangesDuringGuard() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-owner-fence-'));
  const dbPath = path.join(directory, 'execution.db');
  let entered;
  let release;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const releasePromise = new Promise((resolve) => { release = resolve; });
  let observations = 0;
  const first = fixture.setup({ dbPath, currentContext: async () => {
    observations += 1;
    if (observations === 3) { entered(); await releasePromise; }
    return { baseDigest: first.accepted.plan.baseDigest, environmentDigest: first.accepted.plan.environmentDigest,
      generations: first.accepted.context.generations };
  } });
  const second = fixture.setup({ dbPath });
  try {
    const pending = first.runtime.apply(fixture.message(first.accepted));
    await enteredPromise;
    const completed = await second.runtime.apply(fixture.message(second.accepted, 'RESUME'));
    assert.equal(completed.status, 'completed');
    release();
    await assert.rejects(pending, /ownership changed/);
    assert.equal(first.calls.read, 0);
    assert.equal(first.calls.effect, 0);
    assert.equal(second.calls.read, 1);
    assert.equal(second.calls.effect, 1);
  } finally { release(); first.runtime.close(); second.runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function missionIsolationForIdempotency() {
  const first = fixture.accepted();
  const second = structuredClone(first);
  second.context.missionId = 'mission-2';
  second.plan.contextDigest = digest(second.context);
  const setup = fixture.setup({ accepted: first, resolvePlan: async (query) => query.missionId === 'mission-2' ? second : first });
  try {
    const one = fixture.message(first, 'EXECUTE', { idempotencyKey: 'shared-key' });
    const two = fixture.message(second, 'EXECUTE', { missionId: 'mission-2', idempotencyKey: 'shared-key' });
    assert.equal((await setup.runtime.apply(one)).status, 'completed');
    assert.equal((await setup.runtime.apply(two)).status, 'completed');
    assert.equal(setup.calls.read, 2);
    assert.equal(setup.calls.effect, 2);
    assert.equal(setup.runtime.store.db.prepare('SELECT COUNT(*) AS count FROM cognitive_omega_runs').get().count, 2);
  } finally { setup.runtime.close(); }
}

async function capabilitiesChangeDuringFinalContext() {
  const program = fixture.program();
  program.operations = [{ id: 'infer', kind: 'INFER', reference: 'model', dependsOn: [], state: 'open' }];
  program.policy = { infer: ['model'] };
  program.payload = { requests: { infer: { instruction: 'summarise' } } };
  const capabilities = { ...fixture.capabilities(), operations: [{ kind: 'INFER', references: ['model'] }], verifierRefs: [], effectGuarantees: [] };
  const accepted = customAccepted(program, capabilities);
  let observations = 0;
  let generation = 1;
  const setup = fixture.setup({ accepted, describeRuntime: async () => ({ ...capabilities, generation }),
    currentContext: async () => {
      observations += 1;
      if (observations === 4) generation = 2;
      return { baseDigest: accepted.plan.baseDigest, environmentDigest: accepted.plan.environmentDigest,
        generations: accepted.context.generations };
    } });
  try {
    await assert.rejects(setup.runtime.apply(fixture.message(accepted)), /capabilities changed/);
    assert.equal(setup.calls.infer, 0);
    assert.equal(generation, 2);
  } finally { setup.runtime.close(); }
}

async function concurrentReportsAreIdempotent() {
  const setup = fixture.setup();
  try {
    await setup.runtime.apply(fixture.message(setup.accepted));
    const report = fixture.message(setup.accepted, 'REPORT_OBLIGATIONS');
    const [first, second] = await Promise.all([setup.runtime.apply(report), setup.runtime.apply(report)]);
    assert.deepEqual(first, second);
    assert.equal(setup.runtime.history().filter((event) => event.message.messageId === report.messageId).length, 1);
  } finally { setup.runtime.close(); }
}

async function main() {
  await originalPolicyRequired();
  await revokedDuringHandler();
  await actualInferenceOnlyWhenRequested();
  await inferenceOutcomeUnknownBlocksReplay();
  await runConflict();
  await ownershipChangesDuringGuard();
  await missionIsolationForIdempotency();
  await capabilitiesChangeDuringFinalContext();
  await concurrentReportsAreIdempotent();
  console.log('OMEGA native policy, inference boundaries, authority revocation and run binding passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
