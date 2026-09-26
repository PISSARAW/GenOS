'use strict';

const MAXIMIZE = ['correctness', 'coverage', 'robustness', 'reproducibility', 'novelty', 'constraintCoverage'];
const MINIMIZE = ['cost', 'latency', 'risk', 'uncertainty'];
const REQUIRED = ['correctness', 'coverage', 'robustness', 'reproducibility', 'risk', 'uncertainty', 'constraintCoverage'];
const THRESHOLDS = {
  correctness: 0.70, coverage: 0.60, robustness: 0.50, reproducibility: 0.80,
  risk: 0.30, uncertainty: 0.50, constraintCoverage: 0.90
};

const DEFAULT_OBJECTIVE_PROFILES = {
  world1: { name: 'quality_focus', weights: { correctness: 0.35, coverage: 0.30, robustness: 0.20, reproducibility: 0.15 } },
  world2: { name: 'efficiency_focus', weights: { latency: 0.40, reproducibility: 0.30, cost: 0.30 } },
  world3: { name: 'risk_focus', weights: { risk: 0.40, uncertainty: 0.30, constraintCoverage: 0.30 } }
};

function reportedEvidenceIds(report) {
  const evidence = Array.isArray(report.evidence) ? report.evidence : [];
  return new Set(evidence.map((item) => { return defaultIfMissing(item?.id, item); }).filter(Boolean));
}

function defaultIfMissing(value, fallback) {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function normalizeWorld(entry, index, options = {}) {
  const report = defaultIfMissing(entry?.report, defaultIfMissing(entry?.evidenceReport, defaultIfMissing(entry, {})));
  const values = defaultIfMissing(report.evidenceVector, {});
  const refs = defaultIfMissing(report.evidenceVectorEvidence, {});
  const evidenceIds = reportedEvidenceIds(report);
  const missing = REQUIRED.filter((key) => { return !validMeasuredDimension(values[key], refs[key], evidenceIds); });
  const vector = Object.fromEntries([...MAXIMIZE, ...MINIMIZE].map((key) => { return [key, finiteMetric(values[key])]; }));
  const objectiveProfile = options.objectiveProfiles?.[index] || DEFAULT_OBJECTIVE_PROFILES[`world${index + 1}`];
  const scalarized = scalarizeVector(vector, objectiveProfile.weights);
  return {
    worldNumber: defaultIfMissing(entry?.worldNumber, index + 1),
    agentId: defaultIfMissing(entry?.agentId, null),
    role: defaultIfMissing(entry?.role, defaultIfMissing(entry?.strategy, null)),
    report,
    vector,
    scalarized,
    objectiveProfile: objectiveProfile.name,
    missing,
    hardConstraintsPassed: report.hardConstraintsPassed === true,
    budgetStatus: defaultIfMissing(report.budgetStatus, null),
    latencyMs: finiteMetric(report.latencyMs),
    latencyEvidenceValid: hasEvidenceReferences(refs.latency, evidenceIds),
    latencySlaMs: finiteMetric(options.maxLatencyMs)
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
    && hasEvidenceReferences(refs, evidenceIds);
}

function hasEvidenceReferences(refs, evidenceIds) {
  if (!Array.isArray(refs)) return false;
  if (refs.length === 0) return false;
  return refs.every((id) => evidenceIds.has(id));
}

function scalarizeVector(vector, weights) {
  let score = 0;
  let totalWeight = 0;
  for (const [dim, weight] of Object.entries(weights)) {
    const val = vector[dim];
    if (val !== null) {
      const normalized = MAXIMIZE.includes(dim) ? val : (1 - val);
      score += normalized * weight;
      totalWeight += weight;
    }
  }
  return totalWeight > 0 ? Number((score / totalWeight).toFixed(4)) : null;
}

function gateFailures(world) {
  const failures = [];
  addBaseFailures(world, failures);
  addLatencyFailure(world, failures);
  addThresholdFailures(world, failures);
  return failures;
}

function addBaseFailures(world, failures) {
  if (!world.hardConstraintsPassed) failures.push('hard_constraints_not_verified');
  if (world.budgetStatus !== 'within') failures.push('budget_not_verified_within_limit');
}

function addLatencyFailure(world, failures) {
  if (world.latencySlaMs === null) return;
  if (!world.latencyEvidenceValid || world.latencyMs === null) failures.push('latency_sla_evidence_missing');
  else if (world.latencyMs > world.latencySlaMs) failures.push('latency_sla_exceeded');
}

function addThresholdFailures(world, failures) {
  for (const [dimension, threshold] of Object.entries(world.thresholds)) {
    const value = world.vector[dimension];
    if (value === null) continue;
    if (failsThreshold(dimension, value, threshold)) failures.push(`${dimension}_below_gate`);
  }
}

function tightenedThresholds(requested = {}) {
  const values = requested && typeof requested === 'object' ? requested : {};
  return Object.fromEntries(Object.entries(THRESHOLDS).map(([dimension, minimum]) => [
    dimension, thresholdForDimension(dimension, minimum, values[dimension])
  ]));
}

function thresholdForDimension(dimension, minimum, raw) {
  if (raw === null || raw === undefined || raw === '') return minimum;
  const candidate = Number(raw);
  if (!Number.isFinite(candidate) || candidate < 0 || candidate > 1) return minimum;
  return isCeilingDimension(dimension) ? Math.min(minimum, candidate) : Math.max(minimum, candidate);
}

function isCeilingDimension(dimension) {
  return dimension === 'risk' || dimension === 'uncertainty';
}

function failsThreshold(dimension, value, threshold) {
  if (dimension === 'risk' || dimension === 'uncertainty') return value > threshold;
  return value < threshold;
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

function hypervolume(frontier, referencePoint = null) {
  if (!frontier.length) return 0;
  const dims = [...MAXIMIZE, ...MINIMIZE].filter(d => frontier.every(w => w.vector[d] !== null));
  if (!dims.length) return 0;
  const ref = referencePoint || Object.fromEntries(dims.map(d => [d, MAXIMIZE.includes(d) ? 0 : 1]));
  let hv = 0;
  for (const world of frontier) {
    let vol = 1;
    for (const dim of dims) {
      const val = world.vector[dim];
      const r = ref[dim];
      vol *= MAXIMIZE.includes(dim) ? Math.max(0, val - r) : Math.max(0, r - val);
    }
    hv += vol;
  }
  return Number(hv.toFixed(6));
}

function compare(worldReports, options = {}) {
  const thresholds = tightenedThresholds(options.dimensionThresholds);
  const objectiveProfiles = options.objectiveProfiles || [DEFAULT_OBJECTIVE_PROFILES.world1, DEFAULT_OBJECTIVE_PROFILES.world2, DEFAULT_OBJECTIVE_PROFILES.world3];
  const worlds = (Array.isArray(worldReports) ? worldReports : []).map((entry, index) => ({
    ...normalizeWorld(entry, index, { ...options, objectiveProfiles }), thresholds
  }));
  if (worlds.length !== 3) return escalation(worlds, 'exactly_three_worlds_required', thresholds);
  if (worlds.some((world) => world.missing.length)) return escalation(worlds, 'required_evidence_vector_or_provenance_missing', thresholds);
  const gated = worlds.map((world) => ({ ...world, gateFailures: gateFailures(world) }));
  const candidates = gated.filter((world) => !world.gateFailures.length);
  if (!candidates.length) return escalation(gated, 'all_worlds_failed_verification_gates', thresholds);
  const dimensions = sharedDimensions(candidates);
  const frontier = candidates.filter((world) => {
    return !candidates.some((other) => { return other !== world && dominates(other, world, dimensions); });
  });
  const hv = hypervolume(frontier, options.referencePoint);
  if (frontier.length !== 1) {
    const synthesis = options.enableSynthesis && frontier.length > 1;
    return { ...escalation(gated, 'pareto_frontier_requires_human_or_synthesis', thresholds), outcome: synthesis ? 'SYNTHESIZE_CLAIMS' : 'KEEP_PARETO_SET', frontier, dimensions, hypervolume: hv, objectiveProfiles: candidates.map(w => ({ worldNumber: w.worldNumber, profile: w.objectiveProfile, scalarized: w.scalarized })) };
  }
  return { outcome: 'PROMOTE_WORLD', selectedWorld: frontier[0].worldNumber, frontier, worlds: gated, dimensions, thresholds, missing: [], hypervolume: hv, objectiveProfiles: candidates.map(w => ({ worldNumber: w.worldNumber, profile: w.objectiveProfile, scalarized: w.scalarized })) };
}

function escalation(worlds, reason, thresholds = THRESHOLDS) {
  return { outcome: 'ESCALATE_EXPERIMENT', reason, worlds, frontier: [], dimensions: [], thresholds, missing: worlds.flatMap((world) => { return world.missing || []; }), hypervolume: 0 };
}

module.exports = { compare, normalizeWorld, REQUIRED, THRESHOLDS, DEFAULT_OBJECTIVE_PROFILES, hypervolume, scalarizeVector };