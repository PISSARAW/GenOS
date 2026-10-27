'use strict';

const { caseContext, createAdapter } = require('./common');

function createPeriodicLlmLoop(config) {
  return createAdapter({ id: 'periodic_llm_loop', ...config, rounds: 3,
    disclosure: 'Independent three-round same-observation LLM baseline with no tools or persistent state.',
    prompt: ({ testCase, round, prior }) => [`Round ${round}/3; no new environment observations.`,
      `Prior answer: ${prior || '(none)'}`, caseContext(testCase),
      'Re-evaluate and return JSON with answerId and evidenceRefs.'].join('\n') });
}

module.exports = { createPeriodicLlmLoop };
