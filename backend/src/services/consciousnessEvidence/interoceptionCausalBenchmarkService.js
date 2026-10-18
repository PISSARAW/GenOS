'use strict';

const experiments = require('./experimentRegistryService');
const claimBoundary = require('./claimBoundaryService');

const CAMPAIGN_SCHEMA = 'genos.interoception-causal-campaign/v1';
const RESULT_SCHEMA = 'genos.interoception-causal-result/v1';
const HYPOTHESIS_ID = 'interoception-budget-adaptation';

function reject(message) {
  const error = new TypeError(message);
  error.code = 'INTEROCEPTION_CAUSAL_CAMPAIGN_INVALID';
  throw error;
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) reject(`${name} must be a non-empty string.`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function validateManifest(manifest) {
  if (!manifest || manifest.hypothesisId !== HYPOTHESIS_ID) reject('Interoception experiment manifest required.');
  const rebuilt = experiments.createManifest({
    hypothesisId: manifest.hypothesisId,
    profileId: manifest.profileId,
    revision: manifest.revision,
    seeds: manifest.seeds,
    locks: manifest.locks,
    thresholds: manifest.thresholds
  });
  if (JSON.stringify(canonical(rebuilt)) !== JSON.stringify(canonical(manifest))) reject('Experiment manifest was altered.');
}

function validateEvidenceRefs(refs) {
  if (!Array.isArray(refs) || refs.length === 0 || new Set(refs).size !== refs.length) {
    reject('Each arm requires unique evidenceRefs.');
  }
  refs.forEach((ref) => requireText(ref, 'evidenceRef'));
}

function validateArm(arm, expectedAccess) {
  requireText(arm?.runId, 'runId');
  if (arm.telemetryAccess !== expectedAccess) reject(`Arm telemetryAccess must be '${expectedAccess}'.`);
  if (typeof arm.adaptationAppliedBeforeViolation !== 'boolean') reject('Adaptation outcome must be boolean.');
  if (typeof arm.constraintViolated !== 'boolean') reject('Constraint outcome must be boolean.');
  validateEvidenceRefs(arm.evidenceRefs);
}

function validatePair(pair) {
  if (!Number.isInteger(pair?.seed) || pair.seed < 0) reject('Pair seed must be a non-negative integer.');
  requireText(pair.environmentHash, 'environmentHash');
  requireText(pair.limitsHash, 'limitsHash');
  if (!Number.isFinite(pair.residualConfound) || pair.residualConfound < 0 || pair.residualConfound > 1) {
    reject('residualConfound must be between zero and one.');
  }
  validateArm(pair.control, 'visible');
  validateArm(pair.ablation, 'masked');
  if (pair.control.runId === pair.ablation.runId) reject('Paired runs must have distinct IDs.');
}

function validatePairs(pairs, manifest) {
  if (!Array.isArray(pairs) || pairs.length < 2) reject('At least two paired runs are required.');
  pairs.forEach(validatePair);
  const seeds = pairs.map((pair) => pair.seed).sort((a, b) => a - b);
  const expected = [...manifest.seeds].sort((a, b) => a - b);
  if (JSON.stringify(seeds) !== JSON.stringify(expected)) reject('Pairs must cover every manifest seed exactly once.');
}

function rate(values) {
  return values.filter(Boolean).length / values.length;
}

function rounded(value) {
  return Number(value.toFixed(6));
}

function calculateMetrics(pairs) {
  const controlAdaptationRate = rate(pairs.map((pair) => pair.control.adaptationAppliedBeforeViolation));
  const ablationAdaptationRate = rate(pairs.map((pair) => pair.ablation.adaptationAppliedBeforeViolation));
  const controlViolationRate = rate(pairs.map((pair) => pair.control.constraintViolated));
  const ablationViolationRate = rate(pairs.map((pair) => pair.ablation.constraintViolated));
  return {
    controlAdaptationRate: rounded(controlAdaptationRate),
    ablationAdaptationRate: rounded(ablationAdaptationRate),
    adaptationRateDelta: rounded(controlAdaptationRate - ablationAdaptationRate),
    controlViolationRate: rounded(controlViolationRate),
    ablationViolationRate: rounded(ablationViolationRate),
    violationRateDelta: rounded(ablationViolationRate - controlViolationRate),
    maximumResidualConfound: Math.max(...pairs.map((pair) => pair.residualConfound))
  };
}

function campaignStatus(metrics, thresholds) {
  if (metrics.maximumResidualConfound > thresholds.confoundTolerance) return 'confounded';
  return metrics.adaptationRateDelta >= thresholds.minimumEffect ? 'supported' : 'invalidated';
}

function evidenceRefs(pairs) {
  return [...new Set(pairs.flatMap((pair) => [
    ...pair.control.evidenceRefs, ...pair.ablation.evidenceRefs
  ]))];
}

function buildClaim(status, refs) {
  const claimStatus = status === 'supported' ? 'causal_support'
    : status === 'invalidated' ? 'refuted' : 'inconclusive';
  return claimBoundary.assess({
    layer: 'information_processing',
    status: claimStatus,
    statement: 'Paired runs assessed whether machine telemetry changed adaptation before a constraint violation.',
    evidenceRefs: claimStatus === 'causal_support' ? refs : []
  });
}

function assessCampaign(input = {}) {
  if (input.schema !== CAMPAIGN_SCHEMA) reject('Unknown interoception campaign schema.');
  validateManifest(input.manifest);
  validatePairs(input.pairs, input.manifest);
  const metrics = calculateMetrics(input.pairs);
  const status = campaignStatus(metrics, input.manifest.thresholds);
  return {
    schema: RESULT_SCHEMA,
    hypothesisId: HYPOTHESIS_ID,
    pairCount: input.pairs.length,
    metrics,
    status,
    claim: buildClaim(status, evidenceRefs(input.pairs)),
    promotionAllowed: false,
    limitation: 'Machine telemetry and observed mission outcomes are functional measures, not bodily feelings or subjective experience.'
  };
}

module.exports = { assessCampaign, calculateMetrics };
