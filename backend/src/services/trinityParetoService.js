'use strict';

const MAXIMIZE = ['correctness', 'coverage', 'robustness', 'reproducibility', 'novelty', 'constraintCoverage'];
const MINIMIZE = ['cost', 'latency', 'risk', 'uncertainty'];
const REQUIRED = ['correctness', 'coverage', 'robustness', 'reproducibility', 'risk', 'uncertainty', 'constraintCoverage'];
const THRESHOLDS = {
  correctness: 0.70, coverage: 0.60, robustness: 0.50, reproducibility: 0.80,
  risk: 0.30, uncertainty: 0.50, constraintCoverage: 0.90
};

function reportedEvidenceIds(report) {
  const evidence = Array.isArray(report.evidence) ? report.evidence : [];
  return new Set(evidence.map((item) => { return defaultIfMissing(item?.id, item); }).filter(Boolean));
}

function defaultIfMissing(value, fallback) {
  return value === null || value === undefined ? fallback : value;
}

function normalizeWorld(entry, index) {
  const report = defaultIfMissing(entry?.report, defaultIfMissing(entry?.evidenceReport, defaultIfMissing(entry, {})));
  const values = defaultIfMissing(report.evidenceVector, {});
  const refs = defaultIfMissing(report.evidenceVectorEvidence, {});
  const evidenceIds = reportedEvidenceIds(report);
  const missing = REQUIRED.filter((key) => { return !validMeasuredDimension(values[key], refs[key], evidenceIds); });
  const vector = Object.fromEntries([...MAXIMIZE, ...MINIMIZE].map((key) => { return [key, finiteMetric(values[key])]; }));
  return {
    worldNumber: defaultIfMissing(entry?.worldNumber, index + 1),
    agentId: defaultIfMissing(entry?.agentId, null),
    role: defaultIfMissing(entry?.role, defaultIfMissing(entry?.strategy, null)),
    report,
    vector,
    missing,
    hardConstraintsPassed: report.hardConstraintsPassed === true,
    budgetStatus: defaultIfMissing(report.budgetStatus, null)
  };
}

function finiteMetric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function validMeasuredDimension(value, refs, evidenceIds) {
  const number = finiteMetric(value);
  return number !== null && number <= 1 && Array.isArray(refs)
    && refs.length > 0 && refs.every((id) => evidenceIds.has(id));
}

function gateFailures(world) {
  const failures = [];
  if (!world.hardConstraintsPassed) failures.push('hard_constraints_not_verified');
  if (world.budgetStatus !== 'within') failures.push('budget_not_verified_within_limit');
  for (const [dimension, threshold] of Object.entries(THRESHOLDS)) {
    const value = world.vector[dimension];
    if (value === null) continue;
    const failed = dimension === 'risk' || dimension === 'uncertainty' ? value > threshold : value < threshold;
    if (failed) failures.push(`${dimension}_below_gate`);
  }
  return failures;
}

function sharedDimensions(worlds) {
  return [...MAXIMIZE, ...MINIMIZE].filter((key) => { return worlds.every((world) => { return world.vector[key] !== null; }); });
}

function dominates(left, right, dimensions) {
  let strictlyBetter = false;
  for (const dimension of dimensions) {
    const direction = MAXIMIZE.includes(dimension) ? 1 : -1;
    const delta = (left.vector[dimension] - right.vector[dimension]) * direction;
    if (delta < 0) return false;
    if (delta > 0) strictlyBetter = true;
  }
  return strictlyBetter;
}

function compare(worldReports) {
  const worlds = (Array.isArray(worldReports) ? worldReports : []).map(normalizeWorld);
  if (worlds.length !== 3) return escalation(worlds, 'exactly_three_worlds_required');
  if (worlds.some((world) => world.missing.length)) return escalation(worlds, 'required_evidence_vector_or_provenance_missing');
  const gated = worlds.map((world) => ({ ...world, gateFailures: gateFailures(world) }));
  const candidates = gated.filter((world) => !world.gateFailures.length);
  if (!candidates.length) return escalation(gated, 'all_worlds_failed_verification_gates');
  const dimensions = sharedDimensions(candidates);
  const frontier = candidates.filter((world) => {
    return !candidates.some((other) => { return other !== world && dominates(other, world, dimensions); });
  });
  if (frontier.length !== 1) return { ...escalation(gated, 'pareto_frontier_requires_human_or_synthesis'), outcome: 'KEEP_PARETO_SET', frontier, dimensions };
  return { outcome: 'PROMOTE_WORLD', selectedWorld: frontier[0].worldNumber, frontier, worlds: gated, dimensions, missing: [] };
}

function escalation(worlds, reason) {
  return { outcome: 'ESCALATE_EXPERIMENT', reason, worlds, frontier: [], dimensions: [], missing: worlds.flatMap((world) => { return world.missing || []; }) };
}

module.exports = { compare, normalizeWorld, REQUIRED, THRESHOLDS };
