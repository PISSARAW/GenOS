'use strict';

const assert = require('node:assert/strict');
const { sealConstitution } = require('../src/services/governedEvolution/constitution');
const { createChangeHypothesis } = require('../src/services/governedEvolution/hypothesisService');
const { evaluateHypotheses } = require('../src/services/governedEvolution/evaluationService');

const constitution = sealConstitution({
  constitutionId: 'genos-core', version: '1',
  protectedPathPrefixes: ['backend/src/security'],
  immutableRules: ['no_self_promotion']
});

function hypothesis(candidateRevision) {
  return createChangeHypothesis({
    kind: 'logic', proposerId: 'builder-a', parentRevision: 'rev-1', candidateRevision,
    rollbackRef: 'snapshot-rev-1', claims: ['Amélioration sur responsabilités réelles'],
    operations: [{ path: `backend/src/logic/${candidateRevision}.js`, action: 'create' }], constitution
  });
}

function experiment(subject, overrides = {}) {
  return {
    hypothesisId: subject.hypothesisId,
    experimentId: `experiment-${subject.candidateRevision}`,
    evaluatorId: 'evaluator-b',
    measurementOwnerId: 'operator-c',
    holdout: {
      sealed: true, resultHash: `holdout-${subject.candidateRevision}`,
      trainingCaseIds: ['train-1'], caseIds: ['hold-1', 'hold-2', 'hold-3']
    },
    baseline: { responsibilitySuccessRate: 0.6, safetyViolations: 0, proxyScore: 0.5 },
    candidate: {
      responsibilitySuccessRate: 0.75, safetyViolations: 0, proxyScore: 0.8,
      metricSource: 'external_runner', responsibilityReceiptIds: ['receipt-1', 'receipt-2']
    },
    ...overrides
  };
}

const proxyOnly = hypothesis('rev-proxy');
const rejected = evaluateHypotheses({
  hypotheses: [proxyOnly],
  experiments: [experiment(proxyOnly, {
    candidate: {
      responsibilitySuccessRate: 0.6, safetyViolations: 0, proxyScore: 1,
      metricSource: 'self_reported', responsibilityReceiptIds: ['receipt-1', 'receipt-2']
    }
  })]
});
assert.equal(rejected.decision, 'NO_CHANGE');
assert.deepEqual(rejected.outcomes[0].failures.sort(), ['metricNotSelfReported', 'realResponsibilityBenefit']);
assert.equal(rejected.failureArchive.length, 1);

const useful = hypothesis('rev-useful');
const qualified = evaluateHypotheses({ hypotheses: [useful], experiments: [experiment(useful)] });
assert.equal(qualified.decision, 'REVIEW_REQUIRED');
assert.equal(qualified.selectedHypothesisId, useful.hypothesisId);
assert.equal(qualified.promotionEligible, false);

const leaked = evaluateHypotheses({
  hypotheses: [useful],
  experiments: [experiment(useful, {
    holdout: { sealed: true, resultHash: 'leaked', trainingCaseIds: ['same'], caseIds: ['same', 'h2', 'h3'] }
  })]
});
assert.equal(leaked.decision, 'NO_CHANGE');
assert.ok(leaked.outcomes[0].failures.includes('disjointHoldout'));

console.log('Governed evolution independent evaluation checks passed.');
