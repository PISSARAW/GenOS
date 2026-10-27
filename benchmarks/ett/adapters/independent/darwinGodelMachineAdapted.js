'use strict';

const { caseContext, createAdapter } = require('./common');

function createDarwinGodelMachineAdapted(config) {
  return createAdapter({ id: 'darwin_godel_machine_adapted', ...config, rounds: 2,
    disclosure: 'Independent two-stage policy-selection proxy; it does not mutate or execute agent code and is not DGM.',
    prompt: ({ testCase, round, prior }) => [round === 1
      ? 'Stage 1: select a bounded decision-policy change and state a regression check.'
      : `Stage 2: apply the proposed policy in memory: ${prior}`,
    caseContext(testCase),
    'Do not write or execute code. Return JSON with answerId and evidenceRefs.'].join('\n') });
}

module.exports = { createDarwinGodelMachineAdapted };
