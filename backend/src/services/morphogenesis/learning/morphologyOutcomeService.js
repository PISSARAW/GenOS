'use strict';

const { validateLearningEvidence } = require('./outcomeEvidenceValidation');

function createMorphologyOutcome(evidence) {
  if (!validateLearningEvidence(evidence)) {
    throw new TypeError('MorphologyOutcome requires trusted, signed learning evidence.');
  }
  const context = evidence.learningContext;
  return {
    schemaVersion: 1,
    outcomeId: evidence.receiptId,
    problemSignature: context.problemSignature,
    initialMorphology: context.initialMorphology,
    morphologyTransitions: arrayValue(context.morphologyTransitions),
    model: context.model,
    harness: context.harness,
    environment: context.environment,
    budget: context.budget,
    outcome: { status: evidence.success ? 'SUCCESS' : 'FAILURE', score: Number(evidence.value) },
    verificationStrength: {
      kind: evidence.kind,
      verifierDigest: evidence.receipt.verifierDigest,
      independent: evidence.receipt.independent === true,
      receiptId: evidence.receiptId,
      evidenceDigest: evidence.receipt.evidenceDigest,
    },
    cost: context.cost || {},
    latency: nonNegative(context.latency),
    tokens: nonNegative(context.tokens),
    failures: arrayValue(context.failures),
    sourceEvidence: evidence,
  };
}

function arrayValue(value) {
  return Array.isArray(value) ? [...value] : [];
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

module.exports = { createMorphologyOutcome };
