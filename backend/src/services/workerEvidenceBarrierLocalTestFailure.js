'use strict';

function throwIfFailed(proposal, result, consumed) {
  if (!proposal || proposal.testStatus !== 'failed') return;
  const disposition = proposal.rolledBack === false
    ? 'failed candidate remains uncommitted in the isolated capsule.'
    : 'capsule changes were rolled back.';
  const error = Object.assign(new Error(`Local code worker tests failed; ${disposition}`), {
    code: 'WORKER_TESTS_FAILED',
    proposal,
    usage: { inputTokens: Number(result.inputTokens || 0),
      outputTokens: Number(result.outputTokens || 0), tokens: consumed }
  });
  error.failureDiagnostics = require('./workerCodeTestRepairTelemetry').buildFailureDiagnostics(error);
  throw error;
}

module.exports = { throwIfFailed };
