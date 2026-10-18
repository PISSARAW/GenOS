'use strict';

const experiments = require('./experimentRegistryService');
const claimBoundary = require('./claimBoundaryService');

const CAMPAIGN_SCHEMA = 'genos.integration-partition-campaign/v1';
const RESULT_SCHEMA = 'genos.integration-partition-result/v1';
const HYPOTHESIS_ID = 'iit-partition-sensitivity';
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function reject(message) {
  const error = new TypeError(message);
  error.code = 'INTEGRATION_PARTITION_CAMPAIGN_INVALID';
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
  if (!manifest || manifest.hypothesisId !== HYPOTHESIS_ID) reject('Integration partition experiment manifest required.');
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

function validateArm(arm, partitioned, lockedBudget) {
  requireText(arm?.runId, 'runId');
  if (arm.partitioned !== partitioned) reject(`Arm partitioned must be ${partitioned}.`);
  for (const field of ['meanDegree', 'trafficVolume', 'perturbationalIntegrationProxy']) {
    if (!Number.isFinite(arm[field]) || arm[field] < 0) reject(`${field} must be non-negative.`);
  }
  if (arm.perturbationalIntegrationProxy > 1) reject('perturbationalIntegrationProxy must not exceed one.');
  if (arm.budget !== lockedBudget) reject('Arm budget must match the preregistered budget lock.');
  validateEvidenceRefs(arm.evidenceRefs);
}

function validatePair(pair, lockedBudget) {
  if (!Number.isInteger(pair?.seed) || pair.seed < 0) reject('Pair seed must be a non-negative integer.');
  for (const field of ['environmentHash', 'nodeSetHash']) {
    if (!HASH_PATTERN.test(pair[field] || '')) reject(`${field} must be a lowercase SHA-256 hash.`);
  }
  validateArm(pair.control, false, lockedBudget);
  validateArm(pair.intervention, true, lockedBudget);
  if (pair.control.runId === pair.intervention.runId) reject('Paired runs must have distinct IDs.');
  const refs = [...pair.control.evidenceRefs, ...pair.intervention.evidenceRefs];
  if (new Set(refs).size !== refs.length) reject('Paired arms must use distinct evidenceRefs.');
}

function validatePairs(pairs, manifest) {
  if (!Array.isArray(pairs) || pairs.length < 2) reject('At least two paired runs are required.');
  pairs.forEach((pair) => validatePair(pair, manifest.locks.budget));
  const seeds = pairs.map((pair) => pair.seed).sort((a, b) => a - b);
  const expected = [...manifest.seeds].sort((a, b) => a - b);
  if (JSON.stringify(seeds) !== JSON.stringify(expected)) reject('Pairs must cover every manifest seed exactly once.');
}

function rounded(value) {
  return Number(value.toFixed(6));
}

function relativeDelta(left, right) {
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return scale === 0 ? 0 : rounded(Math.abs(left - right) / scale);
}

function assessPair(pair) {
  return {
    seed: pair.seed,
    proxyDelta: rounded(pair.control.perturbationalIntegrationProxy
      - pair.intervention.perturbationalIntegrationProxy),
    degreeDelta: relativeDelta(pair.control.meanDegree, pair.intervention.meanDegree),
    trafficDelta: relativeDelta(pair.control.trafficVolume, pair.intervention.trafficVolume),
    evidenceRefs: [...pair.control.evidenceRefs, ...pair.intervention.evidenceRefs]
  };
}

function average(values) {
  return rounded(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function calculateMetrics(pairs, pairResults = pairs.map(assessPair)) {
  return {
    controlMeanProxy: average(pairs.map((pair) => pair.control.perturbationalIntegrationProxy)),
    interventionMeanProxy: average(pairs.map((pair) => pair.intervention.perturbationalIntegrationProxy)),
    meanProxyDelta: average(pairResults.map((pair) => pair.proxyDelta)),
    maximumDegreeDelta: Math.max(...pairResults.map((pair) => pair.degreeDelta)),
    maximumTrafficDelta: Math.max(...pairResults.map((pair) => pair.trafficDelta))
  };
}

function campaignStatus(metrics, thresholds) {
  const confounded = metrics.maximumDegreeDelta > thresholds.confoundTolerance
    || metrics.maximumTrafficDelta > thresholds.confoundTolerance;
  if (confounded) return 'confounded';
  return metrics.meanProxyDelta >= thresholds.minimumEffect ? 'supported' : 'invalidated';
}

function buildClaim(status, pairResults) {
  const claimStatus = status === 'supported' ? 'causal_support'
    : status === 'invalidated' ? 'refuted' : 'inconclusive';
  const refs = [...new Set(pairResults.flatMap((pair) => pair.evidenceRefs))];
  return claimBoundary.assess({
    layer: 'information_processing',
    status: claimStatus,
    statement: 'Paired runs assessed whether a preregistered graph partition reduced a perturbational integration proxy.',
    evidenceRefs: claimStatus === 'causal_support' ? refs : []
  });
}

function assessCampaign(input = {}) {
  if (input.schema !== CAMPAIGN_SCHEMA) reject('Unknown integration partition campaign schema.');
  validateManifest(input.manifest);
  validatePairs(input.pairs, input.manifest);
  const pairResults = input.pairs.map(assessPair);
  const metrics = calculateMetrics(input.pairs, pairResults);
  const status = campaignStatus(metrics, input.manifest.thresholds);
  return {
    schema: RESULT_SCHEMA,
    hypothesisId: HYPOTHESIS_ID,
    proxyKind: 'perturbational_integration_proxy',
    pairCount: input.pairs.length,
    pairResults,
    metrics,
    status,
    claim: buildClaim(status, pairResults),
    phiComputed: false,
    iitImplemented: false,
    promotionAllowed: false,
    limitation: 'Proxy fonctionnel uniquement : ni Phi, ni implémentation d’IIT, ni preuve de conscience ou d’expérience subjective.'
  };
}

module.exports = { assessCampaign, calculateMetrics };
