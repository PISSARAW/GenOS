'use strict';

const { sameScope } = require('./gvxContracts');

function measurementClaim(profile, metrics) {
  const candidate = metrics.candidate.metrics || metrics.candidate;
  const baseline = metrics.baseline.metrics || metrics.baseline;
  const errors = profile.metrics.map((metric) => Math.abs(candidate[metric].mean - profile.predictedMetrics[metric]));
  const rule = profile.assessmentProfile.rules.find((item) => item.objective !== 'maintain');
  const delta = candidate[rule.metric].mean - baseline[rule.metric].mean;
  return { predictionError: errors.reduce((sum, value) => sum + value, 0) / errors.length,
    reward: Math.min(1, Math.max(0, rule.objective === 'lower' ? -delta : delta)) };
}

function claimMatches(claim, proofs, evaluator) {
  const longitudinal = proofs.find((item) => item.verifierId === 'gvx-longitudinal-assessment-v1' && item.requirement === 'gvx-longitudinal-assessment'
    && item.businessDecision?.maturity === 'mature_somatic_eligible');
  const binding = longitudinal?.businessDecision?.binding;
  const profile = evaluator.profiles.find((item) => item.id === binding?.profileId);
  try { validateClaimProfile({ profile, claim, binding }); } catch (_) { return false; }
  const metrics = collectMeasurements(profile, proofs);
  if (!profile.metrics.every((name) => metrics.baseline[name] && metrics.candidate[name])) return false;
  const expected = measurementClaim(profile, metrics);
  return claim.success === true && claim.predictionError === expected.predictionError && claim.reward === expected.reward;
}

function matchesMeasurement(profile, decision) {
  return decision?.profileId === profile.id && ['baseline', 'candidate'].includes(decision.arm)
    && decision.condition === decision.arm && profile.metrics.includes(decision.metric)
    && decision.parentHash === profile.parentHash && decision.candidateHash === profile.candidateHash
    && sameScope(decision.scope, profile.scope);
}

module.exports = { measurementClaim, claimMatches };

function validateClaimProfile({ profile, claim, binding }) {
  if (!profile || claim.agentId !== profile.agentId || claim.contextHash !== binding.contextHash
      || !sameScope({ ...claim.scope, entityId: claim.entityId }, binding.scope)
      || claim.pathwayId !== profile.pathwayId) throw require('./gvxContracts').error('GVX_CLAIM_PROFILE_MISMATCH');
}

function collectMeasurements(profile, proofs) {
  const metrics = { baseline: {}, candidate: {} };
  for (const proof of proofs) {
    const decision = proof.businessDecision;
    if (proof.verifierId !== 'gvx-execution-metrics-v1' || !matchesMeasurement(profile, decision)) continue;
    metrics[decision.arm][decision.metric] = { mean: decision.mean, samples: decision.samples };
  }
  return metrics;
}
