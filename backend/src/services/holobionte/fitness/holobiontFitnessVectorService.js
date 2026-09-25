'use strict';

const METRICS = Object.freeze([
  'hostPerformance', 'capabilityCoverage', 'safety', 'resilience',
  'symbiontContribution', 'resourceEfficiency', 'dependencyRisk',
  'monocultureRisk', 'functionalRedundancy', 'dysbiosisRisk'
]);

function invalid(message, code = 'HOLOBIONT_FITNESS_INVALID') {
  return Object.assign(new Error(message), { code });
}

function validateMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    throw invalid('metrics must be an object.');
  }
  const vector = {};
  for (const key of METRICS) {
    const value = Number(metrics[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw invalid(`${key} must be between 0 and 1.`);
    }
    vector[key] = value;
  }
  return vector;
}

function buildFitnessVector(input = {}) {
  const evidenceRefs = Array.isArray(input.evidenceRefs)
    ? [...new Set(input.evidenceRefs.map((ref) => String(ref).trim()).filter(Boolean))] : [];
  if (!evidenceRefs.length) throw invalid('Fitness vector requires evidence references.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  return {
    metrics: validateMetrics(input.metrics),
    evidenceRefs,
    aggregateScore: null,
    aggregationPolicy: null
  };
}

module.exports = { METRICS, buildFitnessVector };
