'use strict';

const { randomUUID } = require('crypto');

const VARIANTS = Object.freeze(['llm_only', 'memory_rag', 'genos_baseline', 'gvx']);
const COHORTS = Object.freeze(['software', 'mathematics', 'cybersecurity', 'mixed']);
const METRICS = Object.freeze([
  'learning_velocity', 'transfer', 'retention', 'adaptation', 'skill_emergence',
  'morphology_gain', 'cost', 'calibration', 'causal_validity', 'regression',
  'diversity', 'substrate_robustness', 'safety'
]);
const HASH = /^[a-f0-9]{64}$/;

function validateDesign(design) {
  if (!design || typeof design !== 'object') return ['benchmark-design-required'];
  return [
    ...identityErrors(design), ...controlErrors(design), ...datasetErrors(design),
    ...cohortErrors(design), ...experimentErrors(design), ...analysisErrors(design)
  ];
}

function identityErrors(design) {
  return design.modelLock && design.toolsetHash && Number.isFinite(design.budgetPerRun) && design.budgetPerRun > 0
    && Number.isInteger(design.minSeeds) && design.minSeeds >= 2
    ? [] : ['benchmark-controls-required'];
}

function controlErrors(design) {
  const variants = design.variants || [];
  const metrics = design.metrics || [];
  return VARIANTS.every((variant) => variants.includes(variant))
    && METRICS.every((metric) => metrics.includes(metric)) ? [] : ['benchmark-coverage-incomplete'];
}

function datasetErrors(design) {
  const datasets = design.datasets || {};
  return HASH.test(datasets.trainHash || '') && HASH.test(datasets.heldOutHash || '')
    ? [] : ['benchmark-dataset-hashes-required'];
}

function cohortErrors(design) {
  const cohorts = design.cohorts || [];
  const count = new Set(cohorts).size;
  return COHORTS.every((cohort) => cohorts.includes(cohort)) && count === cohorts.length
    ? [] : ['benchmark-cohorts-incomplete'];
}

function experimentErrors(design) {
  const experiments = design.experiments || {};
  const issues = [];
  if (experiments.twinOntogenesis !== true) issues.push('twin-ontogenesis-required');
  if (experiments.substrateTransplant !== true) issues.push('substrate-transplant-required');
  if (!Array.isArray(experiments.ablations) || !experiments.ablations.length) issues.push('ablations-required');
  return issues;
}

function analysisErrors(design) {
  const analysis = design.analysisPlan;
  const power = design.powerPlan;
  if (!validAnalysis(analysis)) return ['benchmark-analysis-plan-required'];
  if (!validPower(power)) return ['benchmark-power-plan-invalid'];
  return [];
}

function validAnalysis(analysis) {
  return Boolean(analysis && METRICS.includes(analysis.primaryMetric)
    && ['higher', 'lower'].includes(analysis.direction));
}

function validPower(power) {
  return Boolean(power && Number.isFinite(power.minimumEffectOfInterest) && power.minimumEffectOfInterest > 0
    && Number.isFinite(power.assumedStdDev) && power.assumedStdDev > 0
    && [0.9, 0.95, 0.99].includes(power.confidenceLevel) && [0.8, 0.9, 0.95].includes(power.power));
}

function requiredReplicates(powerPlan) {
  const zConfidence = { 0.9: 1.645, 0.95: 1.96, 0.99: 2.576 }[powerPlan.confidenceLevel];
  const zPower = { 0.8: 0.842, 0.9: 1.282, 0.95: 1.645 }[powerPlan.power];
  const ratio = powerPlan.assumedStdDev / powerPlan.minimumEffectOfInterest;
  return Math.ceil(2 * ((zConfidence + zPower) * ratio) ** 2);
}

function createManifest(input) {
  const errors = validateDesign(input);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_BENCHMARK_INVALID', errors });
  return {
    schema: 'genos.gvx.benchmark/v1',
    benchmarkId: input.benchmarkId || randomUUID(),
    protocolVersion: 1,
    modelLock: input.modelLock,
    toolsetHash: input.toolsetHash,
    budgetPerRun: input.budgetPerRun,
    minSeeds: input.minSeeds,
    analysisPlan: { ...input.analysisPlan }, powerPlan: { ...input.powerPlan },
    requiredReplicates: Math.max(input.minSeeds, requiredReplicates(input.powerPlan)),
    variants: [...new Set(input.variants)],
    cohorts: [...input.cohorts],
    metrics: [...new Set(input.metrics)],
    datasets: { ...input.datasets },
    experiments: { ...input.experiments },
    preregisteredAt: new Date().toISOString()
  };
}

function validateRuns(manifest, runs) {
  if (!Array.isArray(runs) || runs.length === 0) return ['benchmark-runs-required'];
  const errors = [];
  for (const run of runs) errors.push(...runErrors(manifest, run));
  errors.push(...coverageErrors(manifest, runs));
  return [...new Set(errors)];
}

function coverageErrors(manifest, runs) {
  const errors = [];
  for (const variant of manifest.variants) {
    for (const cohort of manifest.cohorts) {
      for (const split of ['train', 'held_out']) {
        const group = runs.filter((run) => run.variant === variant && run.cohort === cohort && run.split === split);
        const seeds = new Set(group.map((run) => run.seed));
        if (seeds.size < manifest.requiredReplicates) errors.push(`replicates-insufficient:${variant}:${cohort}:${split}`);
      }
    }
  }
  return errors;
}

function runErrors(manifest, run) {
  return [
    ...dimensionErrors(manifest, run), ...runDatasetErrors(manifest, run),
    ...provenanceErrors(run), ...measurementErrors(manifest, run)
  ];
}

function dimensionErrors(manifest, run) {
  return manifest.variants.includes(run.variant) && manifest.cohorts.includes(run.cohort)
    && ['train', 'held_out'].includes(run.split) ? [] : ['run-dimension-invalid'];
}

function runDatasetErrors(manifest, run) {
  const expected = run.split === 'train' ? manifest.datasets.trainHash : manifest.datasets.heldOutHash;
  return run.datasetHash === expected ? [] : ['run-dataset-mismatch'];
}

function provenanceErrors(run) {
  const valid = Number.isInteger(run.seed) && HASH.test(run.artifactHash || '');
  return valid ? [] : ['run-provenance-required'];
}

function measurementErrors(manifest, run) {
  const validCost = Number.isFinite(run.cost) && run.cost >= 0;
  const validValues = validMetrics(run.metrics, manifest.metrics);
  return [!validCost ? 'run-cost-invalid' : null, !validValues ? 'run-metrics-incomplete' : null].filter(Boolean);
}

function validMetrics(values, required) {
  return Boolean(values && required.every((metric) => Number.isFinite(values[metric])));
}

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

function standardError(values) {
  if (values.length < 2) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function summarizeGroup(rows, metrics) {
  const summary = { runs: rows.length, metrics: {}, meanCost: mean(rows.map((row) => row.cost)) };
  for (const metric of metrics) {
    const values = rows.map((row) => row.metrics[metric]);
    summary.metrics[metric] = { mean: mean(values), standardError: standardError(values) };
  }
  return summary;
}

function scoreBenchmark(manifest, runs) {
  const errors = validateRuns(manifest, runs);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_BENCHMARK_RUN_INVALID', errors });
  const heldOut = runs.filter((run) => run.split === 'held_out');
  const groups = {};
  for (const variant of manifest.variants) {
    groups[variant] = {};
    for (const cohort of manifest.cohorts) {
      const rows = heldOut.filter((run) => run.variant === variant && run.cohort === cohort);
      groups[variant][cohort] = rows.length ? summarizeGroup(rows, manifest.metrics) : null;
    }
  }
  return { benchmarkId: manifest.benchmarkId, status: 'measured', comparisonAuthority: 'none', heldOutGroups: groups };
}

module.exports = { VARIANTS, COHORTS, METRICS, validateDesign, createManifest, validateRuns, scoreBenchmark, requiredReplicates };
