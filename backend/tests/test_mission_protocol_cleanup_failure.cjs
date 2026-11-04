'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const runtime = require('../src/services/missionProtocols/runtime');
const context = require('../src/services/missionProtocols/context');
const allostasis = require('../src/services/missionProtocols/allostasis');
const workspace = require('../src/services/gqwf/missionExecution');
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function fixture(options = {}) {
  const observed = { cleanup: [], diagnostics: [] }, binding = { runId: 'synthetic-run' };
  const db = { get: async query => query.includes('sqlite_master') ? { name: 'gqwf_execution_sessions' }
    : query.includes('strategy_execution_runs') ? { status: options.status || 'running' } : { execution_run_id: binding.runId } };
  const originals = { load: context.load, finish: allostasis.finish,
    finalize: workspace.finalizeMissionWorkspace, error: console.error };
  context.load = async () => binding;
  allostasis.finish = async () => { observed.cleanup.push('ALLOSTASIS'); if (options.allostasisError) throw options.allostasisError; };
  workspace.finalizeMissionWorkspace = async input => { observed.cleanup.push(input.outcomeStatus); return { status: 'finalized' }; };
  console.error = (...args) => observed.diagnostics.push(args);
  return { observed, ctx: { db, executionRun: { id: binding.runId } }, restore: () => {
    context.load = originals.load; allostasis.finish = originals.finish;
    workspace.finalizeMissionWorkspace = originals.finalize; console.error = originals.error;
  } };
}
async function withFixture(options, run) {
  const state = fixture(options);
  try { await run(state); } finally { state.restore(); }
}

test('a running GQWF refusal cannot replace the originating authority expiration', async () => {
  const primary = Object.freeze(Object.assign(new Error('EXECUTION_AUTHORITY_EXPIRED'), { code: 'EXECUTION_AUTHORITY_EXPIRED' }));
  await withFixture({}, async state => {
    await assert.rejects(runtime.runInProcess(state.ctx, async () => { throw primary; }), error => error === primary);
    assert.deepEqual(state.observed.cleanup, ['ALLOSTASIS']);
    assert.ok(JSON.stringify(state.observed.diagnostics).includes('MISSION_GQWF_TERMINAL_RUN_REQUIRED'));
  });
});
test('a running run still cannot finalize after execution returns normally', async () => {
  await withFixture({}, async state => {
    await assert.rejects(runtime.runInProcess(state.ctx, async () => 'unqualified'), /MISSION_GQWF_TERMINAL_RUN_REQUIRED/);
    assert.deepEqual(state.observed.cleanup, ['ALLOSTASIS']);
  });
});
test('both cleanup failures remain diagnostic without replacing the primary error', async () => {
  const primary = new Error('original'), secondary = new Error('allostasis-cleanup');
  await withFixture({ allostasisError: secondary }, async state => {
    await assert.rejects(runtime.runInProcess(state.ctx, async () => { throw primary; }), error => error === primary);
    const diagnostics = JSON.stringify(state.observed.diagnostics);
    assert.match(diagnostics, /MISSION_GQWF_TERMINAL_RUN_REQUIRED/);
    assert.match(diagnostics, /allostasis-cleanup/);
  });
});
test('a cleanup-only error remains fatal and preserves the first failing protocol', async () => {
  await withFixture({ allostasisError: new Error('later-cleanup') }, async state => {
    await assert.rejects(runtime.runInProcess(state.ctx, async () => 'not-delivered'), /MISSION_GQWF_TERMINAL_RUN_REQUIRED/);
    assert.match(JSON.stringify(state.observed.diagnostics), /later-cleanup/);
  });
});
test('failed native runs finalize as failed without producing a successful outcome', async () => {
  const outcome = { status: 'failed', promoted: false };
  await withFixture({ status: 'failed' }, async state => {
    assert.equal(await runtime.runInProcess(state.ctx, async () => outcome), outcome);
    assert.deepEqual(state.observed.cleanup, ['failed', 'ALLOSTASIS']);
    assert.equal(state.observed.diagnostics.length, 0);
  });
});
test('successful native cleanup preserves the exact completed execution result', async () => {
  const outcome = { status: 'completed', artifact: 'unchanged-fixture' };
  await withFixture({ status: 'completed' }, async state => {
    assert.equal(await runtime.runInProcess(state.ctx, async () => outcome), outcome);
    assert.deepEqual(state.observed.cleanup, ['completed', 'ALLOSTASIS']);
  });
});
test('an ALLOSTASIS-only cleanup failure remains fatal', async () => {
  const failure = new Error('ALLOSTASIS_FAILED');
  await withFixture({ status: 'failed', allostasisError: failure }, async state => {
    await assert.rejects(runtime.runInProcess(state.ctx, async () => 'failed-result'), error => error === failure);
    assert.deepEqual(state.observed.cleanup, ['failed', 'ALLOSTASIS']);
  });
});
test('even a falsy thrown value survives secondary protocol failures', async () => {
  await withFixture({}, async state => {
    let caught = false;
    try { await runtime.runInProcess(state.ctx, async () => { throw null; }); }
    catch (error) { caught = true; assert.equal(error, null); }
    assert.equal(caught, true);
    assert.deepEqual(state.observed.cleanup, ['ALLOSTASIS']);
  });
});
test('a failed diagnostic sink cannot replace the originating error', async () => {
  const primary = new Error('originating-failure');
  await withFixture({}, async state => {
    console.error = () => { throw new Error('diagnostic-sink-failed'); };
    await assert.rejects(runtime.runInProcess(state.ctx, async () => { throw primary; }), error => error === primary);
    assert.deepEqual(state.observed.cleanup, ['ALLOSTASIS']);
  });
});
(async () => {
  for (const item of tests) { await item.run(); console.log('PASS ' + item.name); }
  console.log(`Protocol cleanup failure precedence: ${tests.length}/${tests.length} PASS (synthetic execution, real GQWF status guard).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
