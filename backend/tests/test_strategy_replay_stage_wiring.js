'use strict';

const assert = require('node:assert/strict');

function stubModule(relativePath, exports) {
  const id = require.resolve(relativePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

stubModule('../src/db', { getDatabase: async () => { throw new Error('Unexpected database access.'); } });
stubModule('../src/services/mcpExecutor', {});
const telemetryPath = require.resolve('../src/services/telemetryObserver');
require.cache[telemetryPath] = { id: telemetryPath, filename: telemetryPath, loaded: true,
  exports: { emitEvent: () => {} } };
const temporal = require('../src/services/primitiveHandlers/temporal');
const executionEvents = require('../src/services/strategyExecutionEvents');

const stagePrimitives = executionEvents.resolveStagePrimitives('diff_and_replay', [{
  primitives: ['safe_revert', 'causal_replay', 'causal_diff', 'procedural_causal_replay']
}]);
assert.deepEqual(stagePrimitives, ['causal_replay', 'causal_diff', 'procedural_causal_replay']);
assert.deepEqual(executionEvents.missingContext('causal_replay', {}), ['trajectory, turns, trajectoryId, or inputFile']);
assert.deepEqual(executionEvents.missingContext('causal_diff', {}), ['baseline and candidate trajectories or a persisted fork pair']);
assert.deepEqual(executionEvents.missingContext('procedural_causal_replay', {}), [
  'forkId', 'runnerId', 'environmentId', 'snapshotId'
]);
assert.deepEqual(executionEvents.diffReplayMissing(['causal_replay']), { replay: false, diff: true });
assert.deepEqual(executionEvents.diffReplayMissing(['causal_replay', 'causal_diff']), { replay: false, diff: false });
assert.deepEqual(executionEvents.missingContext('causal_replay', { turns: [{ step: 1 }] }), []);
assert.deepEqual(executionEvents.missingContext('causal_diff', {
  baseline: [{ step: 1 }], candidate: [{ step: 1 }]
}), []);

async function verifyReplayNeedsRecordedInput() {
  const result = await temporal.causalReplay({ turns: [] });
  assert.equal(result.success, false);
  assert.equal(result.code, 'STRATEGY_CONTEXT_INCOMPLETE');
  assert.match(result.error, /recorded turns are required/);
}

async function verifyTrajectoryReplayDoesNotClaimExecution() {
  const replay = await temporal.causalReplay({ turns: [{ step: 1, action: 'inspect' }],
    stepIndex: 1, alterations: { action: 'patch' } });
  assert.equal(replay.success, true);
  assert.equal(replay.comparison.outcome, 'INCONCLUSIVE_PENDING_EXECUTION');
  assert.equal(replay.comparison.validationRequired, true);
}

async function verifyIncompleteStageFailsClosed() {
  const db = { get: async () => ({ contract_json: JSON.stringify({ strategy_portfolio: [
    { primitives: ['causal_replay'] }
  ] }) }) };
  const result = await executionEvents.executeStepPrimitives(db, 'agent-1', {
    contractId: 'contract-1', step: { stage_key: 'diff_and_replay' },
    context: { turns: [{ step: 1, action: 'inspect' }] }
  });
  assert.equal(result.success, false);
  assert.equal(result.code, 'STRATEGY_REPLAY_STAGE_INCOMPLETE');
  assert.equal(result.missing.diff, true);
}

async function verifyInapplicableStageFailsClosed() {
  const db = { get: async () => ({ contract_json: JSON.stringify({ strategy_portfolio: [
    { primitives: ['causal_replay', 'causal_diff'] }
  ] }) }) };
  const result = await executionEvents.executeStepPrimitives(db, 'agent-1', {
    contractId: 'contract-1', step: { stage_key: 'diff_and_replay' }, context: {}
  });
  assert.equal(result.success, false);
  assert.equal(result.code, 'STRATEGY_REPLAY_STAGE_INCOMPLETE');
  assert.equal(result.missing.replay, true);
  assert.equal(result.missing.diff, true);
  assert.equal(result.notApplicable.length, 2);
}

async function verifyReplayPrimitivesNeedRunBoundReceipt() {
  const adapterPath = require.resolve('../src/services/strategyExecutionAdapter');
  const originalAdapter = require.cache[adapterPath];
  let pipelineOutput = { success: true, results: [
    { primitive: 'causal_replay', result: { success: true,
      comparison: { outcome: 'INCONCLUSIVE_PENDING_EXECUTION' } } },
    { primitive: 'causal_diff', result: { success: true, divergenceCount: 0 } }
  ] };
  require.cache[adapterPath] = { id: adapterPath, filename: adapterPath, loaded: true,
    exports: { executePipelineWithFeedback: async () => pipelineOutput } };
  const db = { get: async () => ({ contract_json: JSON.stringify({ strategy_portfolio: [
    { primitives: ['causal_replay', 'causal_diff'] }
  ] }) }) };
  const replayReceipt = { success: true, applied: true, replayVerified: true, status: 'verified',
    runId: 'run-1', agentId: 'agent-1', snapshotId: 'snapshot-1', stateDigest: 'a'.repeat(64),
    liveDigest: 'a'.repeat(64) };
  try {
    const input = {
      contractId: 'contract-1', step: { stage_key: 'diff_and_replay' },
      context: { executionRunId: 'run-1', replayReceipt, turns: [{ step: 1 }],
        baseline: [{ step: 1 }], candidate: [{ step: 1 }] }
    };
    const result = await executionEvents.executeStepPrimitives(db, 'agent-1', input);
    assert.equal(result.success, false);
    assert.equal(result.code, 'STRATEGY_RUN_REPLAY_RECEIPT_MISSING');
    assert.match(result.error, /verified receipt bound to this run/);
    pipelineOutput = { ...pipelineOutput, replayReceipt };
    const accepted = await executionEvents.executeStepPrimitives(db, 'agent-1', input);
    assert.equal(accepted.success, true);
    assert.equal(accepted.replayReceipt, replayReceipt);
  } finally {
    if (originalAdapter) require.cache[adapterPath] = originalAdapter;
    else delete require.cache[adapterPath];
  }
}

Promise.all([verifyReplayNeedsRecordedInput(), verifyTrajectoryReplayDoesNotClaimExecution(),
  verifyIncompleteStageFailsClosed(), verifyInapplicableStageFailsClosed(),
  verifyReplayPrimitivesNeedRunBoundReceipt()])
  .then(() => console.log('Strategy diff-and-replay wiring requires recorded input and preserves inconclusive status.'))
  .catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
