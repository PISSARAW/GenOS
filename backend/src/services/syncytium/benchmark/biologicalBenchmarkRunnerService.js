'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const benchmark = require('./syncytiumBenchmarkService');
const semanticValidation = require('../../biologicalSemanticValidationService');
const { listPolicies } = require('../variants/variantPolicyRegistry');

const SUPPORTED_VARIANTS = new Set(listPolicies().map((policy) => policy.id));
const MAX_WORKERS_PER_SCENARIO = 5;
const CAMPAIGN_VARIANT_COUNT = 2;

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
  if (!Array.isArray(manifest.expectedClaims) || manifest.expectedClaims.length === 0) throw invalid('expectedClaims must contain at least one oracle claim.');
  if (manifest.expectedClaims.some((claim) => !claim || !claim.subject || !claim.predicate || claim.value === undefined)) throw invalid('Each expected claim needs subject, predicate, and value.');
  if (!SUPPORTED_VARIANTS.has(manifest.variantId)) throw invalid('variantId must select one of the 13 registered Syncytium policies.');
  validateBudget(manifest.budget);
  validateCampaignBudget(manifest);
  if (manifest.timeoutMs !== undefined && (!Number.isSafeInteger(manifest.timeoutMs) || manifest.timeoutMs < 10000)) throw invalid('timeoutMs must be an integer of at least 10000.');
  if (manifest.scenarioTimeoutMs !== undefined && (!Number.isSafeInteger(manifest.scenarioTimeoutMs) || manifest.scenarioTimeoutMs < 10000)) throw invalid('scenarioTimeoutMs must be an integer of at least 10000.');
}

function validateCampaignBudget(manifest) {
  const maximumCalls = MAX_WORKERS_PER_SCENARIO * CAMPAIGN_VARIANT_COUNT * manifest.repetitions;
  const maximumTokens = manifest.budget.tokens * maximumCalls;
  if (!Number.isFinite(manifest.campaignBudget?.tokens) || manifest.campaignBudget.tokens < maximumTokens) {
    throw invalid(`campaignBudget.tokens must cover the per-worker ceiling for up to ${maximumCalls} workers (${maximumTokens} tokens).`);
  }
  if (manifest.budget.costUsd !== undefined) {
    const maximumCost = manifest.budget.costUsd * maximumCalls;
    if (!Number.isFinite(manifest.campaignBudget?.costUsd) || manifest.campaignBudget.costUsd < maximumCost) {
      throw invalid(`campaignBudget.costUsd must cover the per-worker ceiling for up to ${maximumCalls} workers ($${maximumCost}).`);
    }
  }
}

function validateBudget(budget) {
  for (const dimension of ['tokens', 'events', 'latencyMs', 'costUsd']) {
    if (budget[dimension] !== undefined && (!Number.isFinite(budget[dimension]) || budget[dimension] <= 0)) {
      throw invalid(`budget.${dimension} must be a positive finite number.`);
    }
  }
  if (!Number.isFinite(budget.tokens) || budget.tokens <= 0) throw invalid('budget.tokens must be a positive finite number.');
}

async function executeRun({ manifest, db, variant, repetition }) {
  const output = launchScenario({ manifest, variant });
  const members = output.biologicalMode?.members || [];
  const validation = await semanticValidation.validate(db, members);
  const runtimeValidation = output.biologicalMode?.semanticValidation;
  const counts = metricCounts({ validation, runtimeValidation, baseline: variant.name === 'isolated_baseline' });
  const quality = qualityScore(manifest.expectedClaims, validation.claims);
  const topologyComplete = variant.name === 'isolated_baseline'
    ? output.biologicalMode?.status === 'accepted'
    : output.biologicalMode?.complete === true && output.biologicalMode?.status === 'completed';
  const complete = topologyComplete
    && validation.status === 'complete'
    && !output.biologicalMode?.dispatchFailures?.length
    && members.length > 0 && members.every((member) => member.status === 'completed')
    && quality.value === 1;
  return {
    variant: variant.name, task: manifest.mission, repetition: repetition + 1,
    budget: manifest.budget, workerCount: members.length, validation,
    quality, counts, complete,
    failures: collectFailures(output, members, runtimeValidation, quality),
    dispatchStatus: output.biologicalMode?.status || 'unknown'
  };
}

function collectFailures(output, members, validation, quality) {
  const failures = [...(output.biologicalMode?.dispatchFailures || [])];
  if (output.biologicalMode?.complete !== true && output.biologicalMode?.status !== 'accepted') failures.push('topology_incomplete');
  if (members.some((member) => member.status !== 'completed')) failures.push('worker_not_completed');
  if (validation?.status !== 'complete') failures.push('semantic_validation_incomplete');
  if (quality.value !== 1) failures.push('oracle_claims_not_fully_matched');
  return [...new Set(failures)];
}

function launchScenario({ manifest, variant }) {
  const root = path.resolve(__dirname, '../../../../../');
  const request = {
    action: 'dispatch_biological', mode: variant.mode, mission: manifest.mission,
    executionBudget: manifest.budget, timeoutMs: manifest.timeoutMs,
    variant_id: manifest.variantId, worker_assignments: manifest.workerAssignments
  };
  const perWorkerTimeout = manifest.timeoutMs || 600000;
  const scenarioTimeout = manifest.scenarioTimeoutMs || perWorkerTimeout * Math.ceil(5 / 2) + 30000;
  const result = spawnSync(process.execPath, [path.join(root, 'backend/bin/genos-orchestrate.cjs'), JSON.stringify(request)], {
    cwd: root, encoding: 'utf8', timeout: scenarioTimeout,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GENOS_TOPOLOGY_AWAIT_WORKERS: '1' }
  });
  const output = parseOutput(result.stdout);
  if (result.error || result.status !== 0) {
    if (output.biologicalMode?.complete === true) throw invalid(`Scenario ${variant.name} failed: ${result.error?.message || result.stderr || result.status}`);
    output.biologicalMode.dispatchFailures = [...(output.biologicalMode.dispatchFailures || []), `process_exit_${result.status ?? 'error'}`];
  }
  return output;
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
    campaignBudget: manifest.campaignBudget,
    repetitions: manifest.repetitions, equalBudget: comparison.equalBudget,
    sameWorkerCount, comparable: comparison.equalBudget && sameWorkerCount && runs.every((run) => run.complete),
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
