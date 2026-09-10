const MIN_COVERAGE = 0.8;

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function observerCandidates(report) {
  const candidates = [...arrayOrEmpty(report.integrationFailures), ...arrayOrEmpty(report.failures)];
  if (report.integrationFailure) candidates.push(report.integrationFailure);
  if (report.failure && report.role === 'integration_observer') candidates.push(report.failure);
  return candidates;
}

function normalizeObserverFailures(report) {
  if (!report || typeof report !== 'object') return [];
  return observerCandidates(report)
    .map((failure) => typeof failure === 'string' ? { message: failure } : failure)
    .filter(Boolean);
}

function normalizeCoverage(analysis) {
  const coverage = analysis?.capabilityCoverage || {};
  const ratio = Number(coverage.ratio);
  return {
    ratio: Number.isFinite(ratio) ? ratio : 0,
    coveredSum: Number(coverage.coveredSum || 0),
    requiredSum: Number(coverage.requiredSum || 0),
    covered: coverage.covered || [],
    uncovered: coverage.uncovered || [],
    failed: !Number.isFinite(ratio) || ratio < MIN_COVERAGE
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
      ...(coverage.failed ? [`coverage ${coverage.ratio || 'invalid'} is below ${MIN_COVERAGE}`] : []),
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