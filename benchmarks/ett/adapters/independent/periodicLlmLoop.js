'use strict';

const { caseContext, createAdapter } = require('./common');

function createPeriodicLlmLoop(config) {
  return createAdapter({ id: 'periodic_llm_loop', ...config, rounds: 3,
    disclosure: 'Independent periodic re-evaluation prompt baseline; no persistent state, with the same bounded inspect/submit actions as other systems.',
    prompt: ({ testCase, round, maxTurns, prior }) => [`Re-evaluation ${round}/${maxTurns}; no endogenous question generator or persistent state.`,
      `Prior answer: ${prior || '(none)'}`, caseContext(testCase),
      'Re-evaluate and return JSON with answerId and evidenceRefs.'].join('\n') });
}

module.exports = { createPeriodicLlmLoop };
