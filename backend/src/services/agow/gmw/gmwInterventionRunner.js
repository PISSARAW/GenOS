'use strict';

const challengeRunner = require('../experiments/rivalChallengeRunner');
const signatureService = require('./gmwMediationSignatureService');

async function run(options) {
  const result = await challengeRunner.run({ ...options, challenge: 'gmw' });
  const samples = result.outcomes.filter(validOutcome).map(toSample);
  return { ...result, signature: signatureService.evaluate(samples),
    evidenceStatus: samples.length ? 'verified_intervention_metrics' : 'insufficient_verified_vectors',
    promotionEligible: false };
}

function validOutcome(outcome) {
  const metrics = outcome.metrics || {};
  return outcome.metricsVerified === true && typeof metrics.source === 'string'
    && typeof metrics.target === 'string' && Array.isArray(metrics.inputVector)
    && Array.isArray(metrics.outputDelta);
}

function toSample(outcome) {
  const metrics = outcome.metrics;
  return { source: metrics.source, target: metrics.target, condition: outcome.role,
    input: metrics.inputVector, output: metrics.outputDelta, evidenceRef: outcome.worldId };
}

module.exports = { run, validOutcome, toSample };
