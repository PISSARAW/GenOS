const { isObserverRole } = require('./aTeamService');

const MIN_COVERAGE = 0.8;

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function observerCandidates(report) {
  const candidates = [...arrayOrEmpty(report.integrationFailures), ...arrayOrEmpty(report.failures)];
  if (report.integrationFailure) candidates.push(report.integrationFailure);
  if (report.failure && isObserverRole(report.role)) candidates.push(report.failure);
  return candidates;
}

function normalizeObserverFailures(report) {
  if (!report || typeof report !== 'object') return [];
  return observerCandidates(report)
    .map((failure) => typeof failure === 'string' ? { message: failure } : failure)
    .filter(Boolean);
}

const CANONICAL_DIMENSIONS = Object.freeze({
  missionCoverage: 'MCC',
  staffedCoverage: 'TSC',
  runtimeToolCoverage: 'RCA',
  verifiedCoverage: 'VEC'
});

function coverageDimensions(coverage) {
  return ['missionCoverage', 'staffedCoverage', 'runtimeToolCoverage', 'verifiedCoverage']
    .map((name) => ({ name, canonical: CANONICAL_DIMENSIONS[name], ...(coverage[name] || {}), ratio: coverage[name]?.ratio ?? null }));
}

function invalidDimensions(dimensions) {
  return dimensions.filter((dimension) => dimension.ratio === null
    || !Number.isFinite(Number(dimension.ratio)) || Number(dimension.ratio) <= 0);
}

function normalizeCoverage(analysis) {
  const coverage = analysis?.capabilityCoverage || {};
  const ratio = Number(coverage.ratio);
  const dimensions = coverageDimensions(coverage);
  const failedDimensions = invalidDimensions(dimensions);
  return {
    ratio: Number.isFinite(ratio) ? ratio : 0,
    coveredSum: Number(coverage.coveredSum || 0),
    requiredSum: Number(coverage.requiredSum || 0),
    covered: coverage.covered || [],
    uncovered: coverage.uncovered || [],
    dimensions,
    failedDimensions,
    failed: dimensions.length === 0
      ? !Number.isFinite(ratio) || ratio < MIN_COVERAGE
      : failedDimensions.length > 0
  };
}

function evaluateQualityGate(analysis, observerReport = null) {
  const coverage = normalizeCoverage(analysis);
  const integrationFailures = normalizeObserverFailures(observerReport);
  const integrationFailed = integrationFailures.length > 0;
  return {
    passed: !coverage.failed && !integrationFailed,
    threshold: MIN_COVERAGE,
    coverage,
    integration: {
      failed: integrationFailed,
      failures: integrationFailures
    },
    reasons: [
      ...(coverage.failedDimensions.length
        ? coverage.failedDimensions.map(({ name, ratio }) => `${name} is ${ratio === null ? 'unavailable' : 'zero or invalid'}`)
        : coverage.failed ? [`coverage ${coverage.ratio || 'invalid'} is below ${MIN_COVERAGE}`] : []),
      ...(integrationFailed ? ['integration observer reported a failure'] : [])
    ]
  };
}

function buildEvidence({ mission, analysis, gate, observerReport = null }) {
  return {
    schema: 'genos.ateam-quality-gate/v1',
    generatedAt: new Date().toISOString(),
    mission,
    analysis,
    gate,
    observerReport,
    status: gate.passed ? 'passed' : 'blocked'
  };
}

module.exports = { MIN_COVERAGE, normalizeObserverFailures, evaluateQualityGate, buildEvidence };
