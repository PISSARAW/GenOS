'use strict';

function throwIfFailed(proposal, result, consumed) {
  if (!proposal || proposal.testStatus !== 'failed') return;
  throw Object.assign(new Error('Local code worker tests failed; capsule changes were rolled back.'), {
    code: 'WORKER_TESTS_FAILED',
    proposal,
    usage: { inputTokens: Number(result.inputTokens || 0),
      outputTokens: Number(result.outputTokens || 0), tokens: consumed }
  });
}

module.exports = { throwIfFailed };
