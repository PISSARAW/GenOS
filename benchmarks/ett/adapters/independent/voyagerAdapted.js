'use strict';

const { caseContext, createAdapter } = require('./common');

function createVoyagerAdapted(config) {
  return createAdapter({ id: 'voyager_adapted', ...config,
    disclosure: 'Independent Voyager-inspired curriculum/memory proxy; not the published Voyager executable.',
    prompt: ({ testCase, memory }) => [`Verified skill examples: ${JSON.stringify(memory)}`,
      `Curriculum stage: ${testCase.difficulty}`, caseContext(testCase),
      'Choose a candidate and return JSON with answerId and evidenceRefs.'].join('\n'),
    onVerified: ({ testCase, proposal, memory }) => memory.push({ scenarioId: testCase.scenarioId,
      difficulty: testCase.difficulty, objective: testCase.observation.objective,
      candidateId: proposal.answerId }) });
}

module.exports = { createVoyagerAdapted };
