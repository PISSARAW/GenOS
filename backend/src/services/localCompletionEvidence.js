'use strict';

const FIELDS = ['evidence', 'tests', 'evidenceVector', 'evidenceVectorEvidence', 'coverage',
  'coverageReceipt', 'hardConstraintsPassed', 'budgetStatus', 'uncertainties', 'unverifiedClaims',
  'factorialCell', 'counterfactual', 'oraclePrediction', 'behaviorVector', 'behaviorVectorEvidence',
  'qdTargetNiche', 'temporalEffects', 'latencyMs', 'costUsd'];

function attachFields(report, parsed) {
  for (const field of FIELDS) {
    if (Object.hasOwn(parsed, field)) report[field] = parsed[field];
  }
  return report;
}

function observedRoute(result) {
  if (!result || typeof result.model !== 'string' || typeof result.provider !== 'string') return null;
  return { model: result.model, provider: result.provider };
}

module.exports = { attachFields, observedRoute };
