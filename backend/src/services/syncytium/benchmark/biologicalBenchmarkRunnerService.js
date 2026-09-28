'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const benchmark = require('./syncytiumBenchmarkService');
const semanticValidation = require('../../biologicalSemanticValidationService');
const { VARIANT_WORKERS } = require('../../syncytiumVariantWorkerService');

const VARIANTS = Object.freeze([
  { name: 'isolated_baseline', mode: 'isolated_baseline' },
  { name: 'syncytium', mode: 'syncytium' }
]);

async function runCampaign(manifest, db) {
  validateManifest(manifest);
  const runs = [];
  for (let repetition = 0; repetition < manifest.repetitions; repetition += 1) {
    for (const variant of VARIANTS) {
      runs.push(await executeRun({ manifest, db, variant, repetition }));
    }
  }
  return reportCampaign(manifest, runs);
}

function validateManifest(manifest) {
  if (!manifest || !String(manifest.mission || '').trim()) throw invalid('mission is required.');
  if (!manifest.budget || typeof manifest.budget !== 'object') throw invalid('budget is required.');
  if (!Number.isSafeInteger(manifest.repetitions) || manifest.repetitions < 1) throw invalid('repetitions must be a positive integer.');
  if (!Array.isArray(manifest.expectedClaims)) throw invalid('expectedClaims must be an array (use [] when no oracle is available).');
  if (!Object.hasOwn(VARIANT_WORKERS, manifest.variantId)) throw invalid('variantId must select a supported Syncytium specialist.');
}

async function executeRun({ manifest, db, variant, repetition }) {
  const output = launchScenario({ manifest, variant });
  const members = output.biologicalMode?.members || [];
  const validation = await semanticValidation.validate(db, members);
  const runtimeValidation = output.biologicalMode?.semanticValidation;
  const counts = metricCounts({ validation, runtimeValidation, baseline: variant.name === 'isolated_baseline' });
  return {
    variant: variant.name, task: manifest.mission, repetition: repetition + 1,
    budget: manifest.budget, workerCount: members.length, validation,
    quality: qualityScore(manifest.expectedClaims, validation.claims), counts,
    dispatchStatus: output.biologicalMode?.status || 'unknown'
  };
}

function launchScenario({ manifest, variant }) {
  const root = path.resolve(__dirname, '../../../../../');
  const request = {
    action: 'dispatch_biological', mode: variant.mode, mission: manifest.mission,
    executionBudget: manifest.budget, timeoutMs: manifest.timeoutMs,
    variant_id: manifest.variantId, worker_assignments: manifest.workerAssignments
  };
  const result = spawnSync(process.execPath, [path.join(root, 'backend/bin/genos-orchestrate.cjs'), JSON.stringify(request)], {
    cwd: root, encoding: 'utf8', timeout: manifest.timeoutMs || 600000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GENOS_TOPOLOGY_AWAIT_WORKERS: '1' }
  });
  if (result.error || result.status !== 0) throw invalid(`Scenario ${variant.name} failed: ${result.error?.message || result.stderr || result.status}`);
  return parseOutput(result.stdout);
}

function parseOutput(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.biologicalMode) return parsed;
    } catch (_) {}
  }
  throw invalid('Orchestrator returned no biologicalMode JSON output.');
}

function metricCounts({ validation, runtimeValidation, baseline }) {
  const real = validation.conflicts.length;
  const detected = baseline ? 0 : runtimeValidation?.conflicts?.length || 0;
  return {
    semanticConflictsMissed: Math.max(0, real - detected), realSemanticConflicts: real,
    safeOperationsWithoutCoordination: null, safeOperationsEligible: null,
    violationsPromotedOutsideSyncytium: null, invariantViolations: null,
    relevantUpdatesDelivered: null, allUpdatesDelivered: null
  };
}

function qualityScore(expected, actual) {
  if (!expected.length) return { expectedClaims: 0, matchedClaims: 0, value: null, measured: false };
  const matchedClaims = expected.filter((target) => actual.some((claim) => sameClaim(target, claim))).length;
  return { expectedClaims: expected.length, matchedClaims, value: matchedClaims / expected.length, measured: true };
}

function sameClaim(expected, actual) {
  return key(expected.subject) === key(actual.subject)
    && key(expected.predicate) === key(actual.predicate)
    && key(expected.value) === key(actual.value);
}

function key(value) {
  return String(value ?? '').trim().toLowerCase();
}

function reportCampaign(manifest, runs) {
  const comparison = benchmark.compareRuns(runs.map((run) => ({
    variant: run.variant, task: run.task, budget: run.budget, counts: run.counts
  })));
  const sameWorkerCount = workerCountsMatch(runs, manifest.repetitions);
  return {
    contract: 'GenOSBiologicalBenchmark/v1', mission: manifest.mission,
    repetitions: manifest.repetitions, equalBudget: comparison.equalBudget,
    sameWorkerCount, comparable: comparison.equalBudget && sameWorkerCount,
    comparison, quality: qualitySummary(runs), runs
  };
}

function workerCountsMatch(runs, repetitions) {
  for (let index = 0; index < repetitions; index += 1) {
    const pair = runs.slice(index * VARIANTS.length, (index + 1) * VARIANTS.length);
    if (pair.length !== VARIANTS.length || pair[0].workerCount !== pair[1].workerCount) return false;
  }
  return true;
}

function qualitySummary(runs) {
  const groups = runs.reduce((result, run) => {
    if (!result[run.variant]) result[run.variant] = [];
    result[run.variant].push(run);
    return result;
  }, {});
  return Object.fromEntries(Object.entries(groups).map(([variant, items]) => {
    const measured = items.map((item) => item.quality.value).filter(Number.isFinite);
    return [variant, { runCount: items.length, measuredRuns: measured.length,
      meanRecall: measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null }];
  }));
}

function invalid(message) {
  return Object.assign(new Error(message), { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
}

module.exports = { runCampaign, validateManifest, qualityScore, metricCounts };
