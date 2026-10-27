'use strict';

const { caseContext, createAdapter } = require('./common');

function createReactClassic(config) {
  return createAdapter({ id: 'react_classic', ...config,
    disclosure: 'Independent single-step ReAct-style prompt adapter; not a published ReAct framework executable.',
    prompt: ({ testCase }) => ['Use one thought/action/observation decision cycle. Cite public evidence in evidenceRefs.',
      caseContext(testCase), 'Return JSON with answerId and evidenceRefs.'].join('\n') });
}

module.exports = { createReactClassic };
