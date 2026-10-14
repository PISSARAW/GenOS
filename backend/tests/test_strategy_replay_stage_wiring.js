'use strict';

const assert = require('node:assert/strict');
const telemetry = require('../src/services/telemetryObserver');
telemetry.emitEvent = () => {};
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

Promise.all([verifyReplayNeedsRecordedInput(), verifyTrajectoryReplayDoesNotClaimExecution(),
  verifyIncompleteStageFailsClosed(), verifyInapplicableStageFailsClosed()])
  .then(() => console.log('Strategy diff-and-replay wiring requires recorded input and preserves inconclusive status.'))
  .catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
