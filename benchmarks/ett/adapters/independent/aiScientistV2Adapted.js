'use strict';

const { caseContext, createAdapter } = require('./common');

function createAiScientistV2Adapted(config) {
  return createAdapter({ id: 'ai_scientist_v2_adapted', ...config, rounds: 2,
    disclosure: 'Independent two-stage hypothesis/experiment prompt adaptation; not the AI Scientist v2 executable.',
    prompt: ({ testCase, round, prior }) => [round === 1
      ? 'Stage 1: from competing interpretations, state one falsifiable hypothesis and one discriminating experiment.'
      : `Stage 2: apply this hypothesis and experiment to choose: ${prior}`,
    caseContext(testCase),
    'Return compact JSON only. Use scalar strings for hypothesis and experiment; include answerId and evidenceRefs.'].join('\n') });
}

module.exports = { createAiScientistV2Adapted };
