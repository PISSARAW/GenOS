'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceProtocol/canonical');
const { completed } = require('../src/services/omegaProtocol/effectValidation');
const fixture = require('./helpers/omegaExecutionFixture');

async function realRuntimeAndJournal() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-execution-'));
  const dbPath = path.join(directory, 'execution.db');
  let setup = fixture.setup({ dbPath });
  try {
    const execution = fixture.message(setup.accepted);
    const result = await setup.runtime.apply(execution);
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.runtimeResult.results.map((row) => row.status), ['ready', 'ready', 'verified', 'emitted']);
    assert.deepEqual(result.runtimeResult.values.emit, { published: { answer: 42 } });
    assert.equal(setup.calls.infer, 0);
    assert.equal(setup.calls.effect, 1);
    assert.equal(setup.calls.read, 1);
    assert.equal(result.obligations.length, 4);
    assert.ok(result.obligations.every((row) => row.state === 'open' && row.executionStatus === 'completed'));
    setup.runtime.close();
    setup = fixture.setup({ dbPath });
    assert.deepEqual(await setup.runtime.apply(execution), result);
    const cached = await setup.runtime.apply(fixture.message(setup.accepted, 'RESUME'));
    assert.deepEqual(cached, result);
    assert.deepEqual(setup.calls, { read: 0, select: 0, check: 0, infer: 0, effect: 0 });
    const report = await setup.runtime.apply(fixture.message(setup.accepted, 'REPORT_OBLIGATIONS'));
    assert.equal(report.obligations.length, 4);
    assert.equal(report.status, 'completed');
    await assert.rejects(setup.runtime.apply({ ...execution, operationId: 'conflicting-operation' }), /idempotency conflict/);
  } finally { setup.runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function changedContextAndMissingHandler() {
  const missing = fixture.setup({ handlers: [] });
  try { await assert.rejects(missing.runtime.apply(fixture.message(missing.accepted)), /installed handler missing/); }
  finally { missing.runtime.close(); }
  const stale = fixture.setup({ currentContext: async () => ({ baseDigest: digest('new-base'),
    environmentDigest: digest('environment'), generations: fixture.context.generations }) });
  try { await assert.rejects(stale.runtime.apply(fixture.message(stale.accepted)), /context became stale/); }
  finally { stale.runtime.close(); }
  const setup = fixture.setup();
  try {
    const execution = fixture.message(setup.accepted);
    await assert.rejects(setup.runtime.apply({ ...execution, authority: { ...execution.authority, generation: 2 } }), /authority or generations mismatch/);
    await assert.rejects(setup.runtime.apply({ ...execution, generations: { ...execution.generations, workspace: 2 } }), /authority or generations mismatch/);
  } finally { setup.runtime.close(); }
}

async function forgedEffectReceipt() {
  for (const mutation of ['receiptDigest', 'result']) {
    const setup = fixture.setup({ effectGate: { effect: async (request) => {
      const receipt = completed(request, { published: request.candidate });
      if (mutation === 'receiptDigest') receipt.receiptDigest = digest('wrong');
      else receipt.result = { tampered: true };
      return receipt;
    } } });
    try {
      const result = await setup.runtime.apply(fixture.message(setup.accepted));
      assert.equal(result.status, 'recovery_required');
      assert.equal(result.runtimeResult.error, 'OMEGA effect receipt binding mismatch.');
      assert.equal(result.obligations.find((row) => row.operationId === 'emit').executionStatus, 'running');
    } finally { setup.runtime.close(); }
  }
}

async function unknownEffectResume() {
  let available = false;
  let dispatched = 0;
  let known;
  const setup = fixture.setup({ effectGate: { effect: async (request) => {
    if (!known) { dispatched += 1; known = completed(request, { published: request.candidate }); }
    return available ? known : { status: 'effect_outcome_unknown', effectKey: request.effectKey, requestDigest: digest(request) };
  } } });
  try {
    const result = await setup.runtime.apply(fixture.message(setup.accepted));
    assert.equal(result.status, 'effect_outcome_unknown');
    const stillUnknown = await setup.runtime.apply(fixture.message(setup.accepted, 'RESUME'));
    assert.equal(stillUnknown.status, 'effect_outcome_unknown');
    assert.equal(dispatched, 1);
    available = true;
    const resumed = await setup.runtime.apply(fixture.message(setup.accepted, 'RESUME'));
    assert.equal(resumed.status, 'completed');
    assert.equal(dispatched, 1);
    assert.deepEqual(setup.calls, { read: 1, select: 1, check: 1, infer: 0, effect: 0 });
  } finally { setup.runtime.close(); }
}

async function main() {
  await realRuntimeAndJournal();
  await changedContextAndMissingHandler();
  await forgedEffectReceipt();
  await unknownEffectResume();
  console.log('OMEGA real runtime, durable journal, receipt validation and recovery passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
