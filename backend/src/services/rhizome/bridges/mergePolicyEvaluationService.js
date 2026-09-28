'use strict';

const crypto = require('node:crypto');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireMetric(metrics, key) {
  const value = metrics?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('RHIZOME_DATA_MISSING', `Missing finite numeric metric '${key}'.`);
  }
  return value;
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object') fail('RHIZOME_POLICY_UNDEFINED', 'A versioned merge policy is required.');
  const metricFloors = ['minFitness', 'minCoverage', 'minProvenance', 'minTransferReliability'];
  const numericFields = [...metricFloors, 'maxLatencyVariance', 'minLeaseMs', 'maxLeaseMs'];
  if (!validPolicyVersion(policy) || !validPolicyNumbers(policy, numericFields)) {
    fail('RHIZOME_POLICY_UNDEFINED', 'Merge policy version and thresholds must be explicit and typed.');
  }
  if (!validPolicyBounds(policy, metricFloors)) {
    fail('RHIZOME_POLICY_UNDEFINED', 'Coverage must be at least 0.95 and lease bounds must be ordered.');
  }
}

function validPolicyVersion(policy) {
  return typeof policy.version === 'string' && Boolean(policy.version.trim());
}

function validPolicyNumbers(policy, fields) {
  return fields.every((field) => typeof policy[field] === 'number' && Number.isFinite(policy[field]));
}

function validPolicyBounds(policy, metricFloors) {
  return !metricFloors.some((field) => policy[field] < 0 || policy[field] > 1)
    && policy.maxLatencyVariance >= 0 && policy.minCoverage >= 0.95
    && policy.minLeaseMs >= 0 && policy.maxLeaseMs >= policy.minLeaseMs;
}

function latencyVariance(samples) {
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
}

function verifyGraphRevision(input) {
  if (typeof input.graphRevision !== 'string' || !input.graphRevision.trim()
    || typeof input.expectedGraphRevision !== 'string' || !input.expectedGraphRevision.trim()) {
    fail('RHIZOME_DATA_MISSING', 'Graph revisions are required.');
  }
  if (input.graphRevision !== input.expectedGraphRevision) fail('RHIZOME_GRAPH_STALE', 'Graph revision changed since evidence collection.');
}

function decision(metrics, policy) {
  const mergeChecks = {
    fitness: metrics.bridgeFitness >= policy.minFitness,
    coverage: metrics.coverage >= policy.minCoverage,
    provenance: metrics.provenanceScore >= policy.minProvenance,
    latencyVariance: metrics.latencyVariance <= policy.maxLatencyVariance,
  };
  return {
    canMerge: Object.values(mergeChecks).every(Boolean),
    transferAllowed: metrics.transferReliability >= policy.minTransferReliability,
    mergeChecks,
    leaseMs: Math.round(policy.minLeaseMs + metrics.stability * (policy.maxLeaseMs - policy.minLeaseMs)),
  };
}

function evaluateMerge(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('RHIZOME_DATA_MISSING', 'Evaluation inputs must be an object.');
  }
  validatePolicy(input.policy);
  verifyGraphRevision(input);
  validateLatencySamples(input.latencySamplesMs);
  const metrics = {
    bridgeFitness: requireMetric(input.metrics, 'bridgeFitness'),
    coverage: requireMetric(input.metrics, 'coverage'),
    provenanceScore: requireMetric(input.metrics, 'provenanceScore'),
    transferReliability: requireMetric(input.metrics, 'transferReliability'),
    stability: requireMetric(input.metrics, 'stability'),
    latencyVariance: latencyVariance(input.latencySamplesMs),
  };
  validateNormalizedMetrics(metrics);
  validateEvidenceRefs(input.evidenceRefs);
  const result = decision(metrics, input.policy);
  const evidence = { graphRevision: input.graphRevision, policyVersion: input.policy.version, metrics, decision: result, evidenceRefs: input.evidenceRefs || [] };
  return {
    schema: 'genos.rhizome-merge-evaluation/v1',
    ...evidence,
    receiptHash: crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
  };
}

function validateLatencySamples(samples) {
  const valid = Array.isArray(samples) && samples.length > 0
    && samples.every((value) => Number.isFinite(value) && value >= 0);
  if (!valid) fail('RHIZOME_DATA_MISSING', 'Non-negative latency samples in milliseconds are required.');
}

function validateNormalizedMetrics(metrics) {
  const values = [metrics.bridgeFitness, metrics.coverage, metrics.provenanceScore,
    metrics.transferReliability, metrics.stability];
  if (values.some((value) => value < 0 || value > 1)) {
    fail('RHIZOME_DATA_MISSING', 'Normalized metrics must be within [0, 1].');
  }
}

function validateEvidenceRefs(references) {
  const valid = Array.isArray(references) && references.length > 0
    && references.every((reference) => typeof reference === 'string' && reference.trim());
  if (!valid) fail('RHIZOME_DATA_MISSING', 'Evidence references must be non-empty strings.');
}

module.exports = { evaluateMerge, latencyVariance };
