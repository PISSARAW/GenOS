'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const benchmark = require('./syncytiumBenchmarkService');
const semanticValidation = require('../../biologicalSemanticValidationService');
const scenarioOracle = require('./syncytiumScenarioOracleService');
const budgetEvidence = require('./syncytiumBudgetEvidenceService');
const { listPolicies } = require('../variants/variantPolicyRegistry');
const missionCatalog = require('../../../../fixtures/syncytium/missionCatalog.json');

const SUPPORTED_VARIANTS = new Set([...listPolicies().map((policy) => policy.id), 'transversal']);
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

function assertManifestShape(manifest) {
  if (validateManifestCondition5(manifest)) throw invalid('mission is required.');
  if (!manifest.budget || typeof manifest.budget !== 'object') throw invalid('budget is required.');
  if (!Number.isSafeInteger(manifest.repetitions) || manifest.repetitions < 1) throw invalid('repetitions must be a positive integer.');
}

function assertManifestClaims(manifest) {
  if (!Array.isArray(manifest.expectedClaims) || manifest.expectedClaims.length === 0) throw invalid('expectedClaims must contain at least one oracle claim.');
  if (manifest.expectedClaims.some((claim) => validateManifestCondition2(claim))) throw invalid('Each expected claim needs subject, predicate, and value.');
  if (!SUPPORTED_VARIANTS.has(manifest.variantId)) throw invalid('variantId must select a registered Syncytium policy or the transversal protocol.');
}

function assertManifestTimeouts(manifest) {
  if (validateManifestCondition(manifest)) throw invalid('timeoutMs must be an integer from 10000 through 600000.');
  const minimumScenarioTimeout = (manifest.timeoutMs || 600000) * Math.ceil(MAX_WORKERS_PER_SCENARIO / 2) + 30000;
  if (validateManifestCondition3(manifest, minimumScenarioTimeout)) {
    throw invalid(`scenarioTimeoutMs must cover three worker waves and startup margin (at least ${minimumScenarioTimeout} ms).`);
  }
}

function validateManifest(manifest) {
  assertManifestShape(manifest);
  assertManifestClaims(manifest);
  validateScenarioIdentity(manifest);
  validateBudget(manifest.budget);
  validateCampaignBudget(manifest);
  assertManifestTimeouts(manifest);
}

function validateCampaignBudget(manifest) {
  const maximumCalls = MAX_WORKERS_PER_SCENARIO * CAMPAIGN_VARIANT_COUNT * manifest.repetitions;
  const maximumTokens = manifest.budget.tokens * maximumCalls;
  if (!Number.isFinite(manifest.campaignBudget?.tokens) || manifest.campaignBudget.tokens < maximumTokens) {
    throw invalid(`campaignBudget.tokens must cover the per-worker ceiling for up to ${maximumCalls} workers (${maximumTokens} tokens).`);
  }
  const maximumCost = manifest.budget.costUsd * maximumCalls;
  if (!Number.isFinite(manifest.campaignBudget?.costUsd) || manifest.campaignBudget.costUsd < maximumCost) {
    throw invalid(`campaignBudget.costUsd must cover the per-worker ceiling for up to ${maximumCalls} workers ($${maximumCost}).`);
  }
}

function validateBudget(budget) {
  for (const dimension of ['tokens', 'events', 'latencyMs', 'costUsd']) {
    if (budget[dimension] !== undefined && (!Number.isFinite(budget[dimension]) || budget[dimension] <= 0)) {
      throw invalid(`budget.${dimension} must be a positive finite number.`);
    }
  }
  if (!Number.isFinite(budget.tokens) || budget.tokens <= 0) throw invalid('budget.tokens must be a positive finite number.');
  if (!Number.isFinite(budget.costUsd) || budget.costUsd <= 0) throw invalid('budget.costUsd must be a positive finite per-worker ceiling.');
}

async function executeRun({ manifest, db, variant, repetition }) {
  const output = launchScenario({ manifest, variant });
  const members = output.biologicalMode?.members || [];
  const validation = await semanticValidation.validate(db, members);
  const runtimeValidation = output.biologicalMode?.semanticValidation;
  const counts = metricCounts({ validation, runtimeValidation, baseline: variant.name === 'isolated_baseline' });
  const quality = qualityScore(manifest.expectedClaims, validation.claims);
  const observedBudget = await budgetEvidence.measure(db, members, manifest.budget);
  const oracle = variant.name === 'syncytium'
    ? await scenarioOracle.evaluate(db, output.biologicalMode?.sessionId, manifest.oracle)
      .catch((error) => ({ measured: false, pass: false,
        reason: 'oracle_evaluation_error', code: error.code || null, error: error.message }))
    : { measured: false, pass: false, reason: 'baseline_without_variant_oracle' };
  const topologyComplete = executeRunTopologyComplete(variant, output);
  const executionValid = executeRunCondition(topologyComplete, output, members) && members.every((member) => member.status === 'completed')
    && observedBudget.verified;
  const complete = executeRunComplete({ executionValid, validation, quality, variant, oracle });
  return {
    variant: variant.name, caseId: manifest.caseId || null,
    task: manifest.mission, repetition: repetition + 1,
    budget: manifest.budget, workerCount: members.length, validation,
    quality, oracle, observedBudget, counts, executionValid, complete,
    failures: collectFailures({ output, members, validation: runtimeValidation || validation,
      quality, oracle, variantName: variant.name, observedBudget }),
    dispatchStatus: output.biologicalMode?.status || 'unknown'
  };
}

function collectFailures(input) {
  const { output, members, validation, quality, oracle, variantName, observedBudget } = input;
  const failures = [...(output.biologicalMode?.dispatchFailures || [])];
  if (output.biologicalMode?.complete !== true && output.biologicalMode?.status !== 'accepted') failures.push('topology_incomplete');
  if (members.some((member) => member.status !== 'completed')) failures.push('worker_not_completed');
  if (validation?.status !== 'complete') failures.push('semantic_validation_incomplete');
  if (quality.value !== 1) failures.push('oracle_claims_not_fully_matched');
  if (variantName === 'syncytium' && !oracle.pass) failures.push('independent_variant_oracle_failed');
  if (!observedBudget.verified) failures.push('budget_usage_unverified_or_exceeded');
  return [...new Set(failures)];
}

function launchScenario({ manifest, variant }) {
  const root = path.resolve(__dirname, '../../../../../');
  const transversal = manifest.variantId === 'transversal';
  const request = {
    action: 'dispatch_biological', mode: variant.mode, mission: manifest.mission,
    executionBudget: manifest.budget, timeoutMs: manifest.timeoutMs,
    variant_id: transversal ? undefined : manifest.variantId,
    worker_assignments: manifest.workerAssignments,
    configuration: { ...(manifest.configuration || {}), useVariantRuntime: !transversal },
    sessionOptions: manifest.sessionOptions
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
  return { biologicalMode: { status: 'failed', members: [], complete: false,
    dispatchFailures: ['orchestrator_returned_no_biological_output'] } };
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
  const aggregateUsage = {
    tokens: sumObserved(runs, 'tokens'),
    costUsd: sumObserved(runs, 'costUsd')
  };
  const campaignBudgetVerified = runs.every((run) => run.observedBudget.verified)
    && aggregateUsage.tokens !== null && aggregateUsage.costUsd !== null
    && aggregateUsage.tokens <= manifest.campaignBudget.tokens
    && aggregateUsage.costUsd <= manifest.campaignBudget.costUsd;
  return {
    contract: 'GenOSBiologicalBenchmark/v1', caseId: manifest.caseId || null,
    mission: manifest.mission,
    campaignBudget: manifest.campaignBudget, aggregateUsage, campaignBudgetVerified,
    repetitions: manifest.repetitions, equalBudget: comparison.equalBudget,
    sameWorkerCount, comparable: comparison.equalBudget && sameWorkerCount
      && campaignBudgetVerified && runs.every((run) => run.executionValid),
    comparison, quality: qualitySummary(runs), runs
  };
}

function sumObserved(runs, dimension) {
  const values = runs.map((run) => run.observedBudget.observed[dimension]);
  return values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null;
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

function validateManifestCondition(manifest) {
  return manifest.timeoutMs !== undefined && (!Number.isSafeInteger(manifest.timeoutMs) || manifest.timeoutMs < 10000 || manifest.timeoutMs > 600000);
}

function validateManifestCondition2(claim) {
  return !claim || !claim.subject || !claim.predicate || claim.value === undefined;
}

function validateManifestCondition3(manifest, minimumScenarioTimeout) {
  return manifest.scenarioTimeoutMs !== undefined
    && (!Number.isSafeInteger(manifest.scenarioTimeoutMs) || manifest.scenarioTimeoutMs < minimumScenarioTimeout);
}

function validateManifestCondition4(scenario, manifest) {
  return !scenario || scenario.variantId !== manifest.variantId
      || scenario.mission !== manifest.mission;
}

function validateManifestCondition5(manifest) {
  return !manifest || !String(manifest.mission || '').trim();
}

function executeRunComplete({ executionValid, validation, quality, variant, oracle }) {
  return executionValid
    && validation.status === 'complete'
    && quality.value === 1 && (variant.name !== 'syncytium' || oracle.pass);
}

function executeRunTopologyComplete(variant, output) {
  return variant.name === 'isolated_baseline'
    ? output.biologicalMode?.status === 'accepted'
    : output.biologicalMode?.complete === true && output.biologicalMode?.status === 'completed';
}

function executeRunCondition(topologyComplete, output, members) {
  return topologyComplete
    && !output.biologicalMode?.dispatchFailures?.length
    && members.length > 0;
}

function validateScenarioIdentity(manifest) {
if (manifest.caseId) {
    const scenario = missionCatalog.cases.find((item) => item.id === manifest.caseId);
    if (validateManifestCondition4(scenario, manifest)) throw invalid('caseId, variantId and mission must match the versioned catalog.');
  }
  if (manifest.variantId === 'humanAi' && !manifest.configuration?.nuclei?.some((nucleus) => nucleus.kind === 'human')) {
    throw invalid('Human-AI campaigns require a configured human nucleus.');
  }
}
