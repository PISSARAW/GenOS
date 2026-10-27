'use strict';

const { createLedger, questionGenerator, createModelWorker, DEFAULT_MODEL } = require('./localModel');
const { verifyInChild } = require('../evaluation/verifyInChild');

function answerIdFromEvidence(evidenceRefs = []) {
  const reference = evidenceRefs.find((item) => item.startsWith('ett-answer:'));
  return reference ? reference.slice('ett-answer:'.length) : null;
}

function sandbox(worker, observation) {
  return Object.freeze({
    kind: 'isolated-read-only', readOnly: true, networkAllowed: false,
    mutationAllowed: false, externalActionAllowed: false,
    async execute(request) { return worker.solve({ ...request, observation }); }
  });
}

function createRuntimeAdapter({ model = DEFAULT_MODEL, observation, oracle }) {
  const ledger = createLedger();
  const worker = createModelWorker({ ledger, model, observation });
  return {
    model, ledger, questionGenerator: questionGenerator(ledger, model),
    budget: { tokens: 12000, usd: 0.1, seconds: 1800 },
    worker, sandbox: sandbox(worker, observation),
    usageMeter: { snapshot: async () => {
      const sample = ledger.takeSnapshot();
      return { tokens: sample.tokens, usd: sample.usd, seconds: sample.seconds };
    } },
    verify: (proposal, evidenceRefs) => verifyInChild(oracle,
      { ...proposal, answerId: answerIdFromEvidence(evidenceRefs), evidenceRefs }),
    usageSummary: () => ledger.summary()
  };
}

module.exports = { createRuntimeAdapter };
