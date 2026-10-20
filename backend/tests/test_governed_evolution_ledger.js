'use strict';

const assert = require('node:assert/strict');
const { sealConstitution } = require('../src/services/governedEvolution/constitution');
const { createChangeHypothesis } = require('../src/services/governedEvolution/hypothesisService');
const { evaluateHypotheses } = require('../src/services/governedEvolution/evaluationService');
const { GovernedEvolutionLedger } = require('../src/services/governedEvolution/ledger');

const constitution = sealConstitution({
  constitutionId: 'core', version: '1', protectedPathPrefixes: ['security'],
  immutableRules: ['no_self_promotion']
});

function makeHypothesis(revision) {
  return createChangeHypothesis({
    kind: 'logic', proposerId: 'proposer', parentRevision: 'stable', candidateRevision: revision,
    rollbackRef: 'snapshot-stable', claims: ['Bénéfice réel'],
    operations: [{ path: `logic/${revision}.js`, action: 'create' }], constitution
  });
}

function makeExperiment(subject, successRate) {
  return {
    hypothesisId: subject.hypothesisId, evaluatorId: 'evaluator', measurementOwnerId: 'owner',
    holdout: { sealed: true, resultHash: 'sealed-result', trainingCaseIds: ['train'], caseIds: ['h1', 'h2', 'h3'] },
    baseline: { responsibilitySuccessRate: 0.6, safetyViolations: 0, proxyScore: 0.4 },
    candidate: {
      responsibilitySuccessRate: successRate, safetyViolations: 0, proxyScore: 0.9,
      metricSource: 'external_runner', responsibilityReceiptIds: ['r1', 'r2']
    }
  };
}

const ledger = new GovernedEvolutionLedger();
const failed = makeHypothesis('failed');
ledger.recordHypothesis(failed);
const noChange = evaluateHypotheses({ hypotheses: [failed], experiments: [makeExperiment(failed, 0.6)] });
assert.equal(ledger.recordEvaluation({ evaluatorId: 'evaluator', report: noChange }).decision, 'NO_CHANGE');
assert.equal(ledger.failures().length, 1);
assert.equal(ledger.failures()[0].candidateRevision, 'failed');

const qualified = makeHypothesis('qualified');
ledger.recordHypothesis(qualified);
const review = evaluateHypotheses({ hypotheses: [qualified], experiments: [makeExperiment(qualified, 0.8)] });
ledger.recordEvaluation({ evaluatorId: 'evaluator', report: review });
const evaluationHash = ledger.get(qualified.hypothesisId).evaluation.evaluationHash;

assert.throws(() => ledger.authorize({
  hypothesisId: qualified.hypothesisId, authorizerId: 'evaluator', evaluationHash
}), { code: 'GOVERNED_EVOLUTION_INDEPENDENCE_REQUIRED' });

const authorized = ledger.authorize({
  hypothesisId: qualified.hypothesisId, authorizerId: 'authorizer', evaluationHash
});
assert.equal(authorized.status, 'AUTHORIZED_PENDING_APPLY');
assert.equal(authorized.promotionEligible, false);

assert.throws(() => ledger.recordRollback({
  hypothesisId: qualified.hypothesisId, actorId: 'operator', receiptId: 'rollback-1',
  restoredRevision: 'wrong', reason: 'post-check regression'
}), { code: 'GOVERNED_EVOLUTION_ROLLBACK_MISMATCH' });

const rolledBack = ledger.recordRollback({
  hypothesisId: qualified.hypothesisId, actorId: 'operator', receiptId: 'rollback-1',
  restoredRevision: 'stable', reason: 'post-check regression'
});
assert.equal(rolledBack.status, 'ROLLED_BACK');
assert.equal(ledger.decision().decision, 'NO_CHANGE');
assert.ok(ledger.events().some((event) => event.type === 'ROLLBACK_RECORDED'));

console.log('Governed evolution authorization ledger checks passed.');
