'use strict';

const REVIEW_KEYS = Object.freeze({
  adversarial: 'adversarialReview', temporal: 'temporalReview', recursive: 'recursiveExecution',
  adaptive: 'adaptiveBudgetExecution', exploratoryReplicas: 'qualityDiversityReplicas',
  sequential: 'sequentialExecution', crossExamination: 'crossExamination',
  diversity: 'effectiveDiversity', factorialTreatment: 'factorialTreatment'
});
const EXECUTION_KEYS = Object.freeze({
  counterfactual: 'counterfactual', factorial: 'factorial', oracular: 'oracle',
  exploratory: 'qualityDiversity', scalarized: 'scalarizedObjectives'
});

function summary(value) {
  if (!value || typeof value !== 'object') return { status: 'missing' };
  const status = typeof value.status === 'string' ? value.status
    : typeof value.phase === 'string' ? value.phase
    : typeof value.evidenceStatus === 'string' ? value.evidenceStatus
    : value.valid === true ? 'verified' : value.valid === false ? 'invalid' : 'unverified';
  return { status, reason: value.reason || null };
}

function fromComparison(comparison) {
  const result = {};
  for (const [name, key] of Object.entries(REVIEW_KEYS)) result[name] = summary(comparison?.[key]);
  for (const [name, key] of Object.entries(EXECUTION_KEYS)) {
    result[name] = summary(comparison?.variantExecution?.executions?.[key]);
  }
  return result;
}

module.exports = { fromComparison };
