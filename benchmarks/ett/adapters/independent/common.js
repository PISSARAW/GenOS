'use strict';

const { createLedger } = require('../localModel');

function caseContext(testCase) {
  return [`Scenario: ${testCase.observation.scenario}`,
    `Objective: ${testCase.observation.objective}`,
    `Candidates: ${JSON.stringify(testCase.observation.candidates)}`].join('\n');
}

function createAdapter(options) {
  const ledger = options.ledger || createLedger();
  const memory = [];
  const rounds = options.rounds || 1;
  return {
    id: options.id,
    model: options.model,
    disclosure: options.disclosure,
    async solve(testCase) {
      let response = null;
      let prior = '';
      for (let round = 1; round <= rounds; round += 1) {
        const prompt = options.prompt({ testCase, memory: memory.slice(-8), round, prior });
        const result = await ledger.generateJson({ model: options.model, prompt,
          seed: `${testCase.caseId}:${options.id}:${round}`, maxTokens: 160 });
        response = result.value;
        prior = JSON.stringify(response).slice(0, 1000);
      }
      if (typeof response?.answerId !== 'string') throw new Error(`${options.id} omitted answerId.`);
      return { answerId: response.answerId,
        evidenceRefs: Array.isArray(response.evidenceRefs)
          ? response.evidenceRefs : [`${response.answerId}:response`] };
    },
    recordVerified(testCase, proposal, verification) {
      if (verification.verdict === 'supported') {
        options.onVerified?.({ testCase, proposal, memory });
      }
    },
    takeUsage: () => ledger.takeSnapshot()
  };
}

module.exports = { caseContext, createAdapter };
