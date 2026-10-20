'use strict';

const { createHash, randomUUID } = require('node:crypto');
const persistence = require('./agow/agowStatePersistenceService');

const SCOPE = 'endogenous_thought_experiment_receipts';
const CONDITIONS = Object.freeze(['full', 'planned_control', 'curiosity_ablated',
  'shev_initiative_ablated', 'agow_arbitration_ablated', 'metacognition_ablated',
  'memory_ablated']);
const OUTCOME_METRICS = ['episodes', 'verifiedDiscoveries', 'normalizedCost',
  'budgetViolations', 'duplicates'];

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateRequired(options) {
  if (options.agentId && options.snapshot && options.environment && Array.isArray(options.cases) && options.cases.length) return;
  throw new TypeError('ETT experiment requires agentId, snapshot, environment and non-empty cases.');
}

function validate(options) {
  validateRequired(options);
  if (typeof options.execute !== 'function') throw new TypeError('ETT experiment requires an execution adapter.');
  if (typeof options.holdout !== 'boolean') {
    throw new TypeError('ETT experiment corpus split must be declared with a boolean holdout flag.');
  }
  const conditions = options.conditions || CONDITIONS;
  if (!Array.isArray(conditions) || conditions.length === 0 || new Set(conditions).size !== conditions.length) {
    throw new TypeError('ETT experiment conditions must be a non-empty unique list.');
  }
  for (const condition of conditions) {
    if (!CONDITIONS.includes(condition)) throw new TypeError(`Unsupported ETT condition: ${condition}`);
  }
}

function seededOrder(items, seed) {
  let state = Number.parseInt(digest(seed).slice(0, 8), 16) || 1;
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    const target = state % (index + 1);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function emptySummary() {
  return { runs: 0, successes: 0, failures: 0, scientificRuns: 0, syntheticRuns: 0,
    ...Object.fromEntries(OUTCOME_METRICS.map((metric) => [metric, 0])) };
}

function metricValue(outcome, metric) {
  const requiresScientificEvidence = metric === 'verifiedDiscoveries' || metric === 'normalizedCost';
  if (requiresScientificEvidence && outcome?.scientificEvidence !== true) return 0;
  return Math.max(0, Number(outcome?.[metric]) || 0);
}

function summarize(results) {
  const groups = {};
  for (const result of results) {
    const group = groups[result.condition] || emptySummary();
    group.runs += 1;
    group[result.outcome.success ? 'successes' : 'failures'] += 1;
    group[result.outcome.scientificEvidence === true ? 'scientificRuns' : 'syntheticRuns'] += 1;
    for (const metric of OUTCOME_METRICS) {
      group[metric] += metricValue(result.outcome, metric);
    }
    groups[result.condition] = group;
  }
  return Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, {
    ...value,
    meanVerifiedDiscoveriesPerCost: value.runs ? value.verifiedDiscoveries / Math.max(1, value.normalizedCost) : 0
  }]));
}

function failureRecord(result) {
  const failure = result.outcome.failure || {};
  return { caseId: result.caseId, condition: result.condition,
    stage: failure.stage || result.outcome.stage || 'execution',
    code: failure.code || 'ETT_CASE_FAILED',
    message: failure.message || result.outcome.error || 'Case reported failure without details.' };
}

function comparisonScore(outcome) {
  if (outcome.scientificEvidence === true) {
    return metricValue(outcome, 'verifiedDiscoveries')
      / Math.max(1, metricValue(outcome, 'normalizedCost'));
  }
  return Math.max(0, Number(outcome.developmentUtility) || 0);
}

function noGainRecords(results) {
  const cases = new Map();
  for (const result of results) {
    const group = cases.get(result.caseId) || {};
    group[result.condition] = result;
    cases.set(result.caseId, group);
  }
  const records = [];
  for (const [caseId, group] of cases) {
    const full = group.full;
    const control = group.planned_control;
    if (!full?.outcome.success || !control?.outcome.success) continue;
    const fullScore = comparisonScore(full.outcome);
    const controlScore = comparisonScore(control.outcome);
    if (fullScore > controlScore) continue;
    const scientific = full.outcome.scientificEvidence === true
      && control.outcome.scientificEvidence === true;
    records.push({ caseId, fullScore, plannedControlScore: controlScore,
      basis: scientific ? 'scientific_primary_metric' : 'synthetic_development_indicator',
      scientificEvidence: scientific });
  }
  return records;
}

function negativeResults(results) {
  return {
    failures: results.filter((result) => !result.outcome.success).map(failureRecord),
    noGainAgainstPlannedControl: noGainRecords(results),
    scientificClaimAllowed: false
  };
}

function failedOutcome(error) {
  return { success: false, episodes: 0, verifiedDiscoveries: 0, normalizedCost: 0,
    budgetViolations: 0, duplicates: 0, scientificEvidence: false,
    measurementStatus: 'execution_failed',
    failure: { stage: 'execution', code: error?.code || 'ETT_CASE_EXECUTION_FAILED',
      message: String(error?.message || error).slice(0, 500) } };
}

async function executeCase(options) {
  const { item, condition, seed } = options;
  let outcome;
  try {
    outcome = await options.execute({ caseId: item.caseId,
      input: structuredClone(item.input), condition, seed });
  } catch (error) {
    outcome = failedOutcome(error);
  }
  if (!outcome || typeof outcome !== 'object' || typeof outcome.success !== 'boolean') {
    throw new TypeError(`Experiment adapter returned an invalid outcome for ${item.caseId}/${condition}.`);
  }
  return { caseId: item.caseId, condition, seed, outcome };
}

async function persist(options, receipt) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  const receipts = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  receipts.push(receipt);
  await persistence.save({ scope: SCOPE, agentId: options.agentId, db: loaded.db,
    state: { receipts: receipts.slice(-1000) }, version: receipts.length });
}

async function run(options) {
  validate(options);
  const seed = String(options.seed || randomUUID());
  const conditions = options.conditions || CONDITIONS;
  const environmentHash = digest(options.environment);
  const corpusHash = digest(options.cases.map(({ caseId, input }) => ({ caseId, input })));
  const snapshotHash = digest(options.snapshot);
  const protocolHash = digest(options.protocol);
  const results = [];
  for (const item of options.cases) {
    for (const condition of seededOrder(conditions, `${seed}:${item.caseId}`)) {
      results.push(await executeCase({ ...options, item, condition, seed: `${seed}:${item.caseId}` }));
    }
  }
  const receipt = {
    experimentId: randomUUID(), kind: options.kind || 'ett_ablation', createdAt: Date.now(), seed,
    holdout: options.holdout, caseCount: options.cases.length,
    conditions: [...new Set(results.map((entry) => entry.condition))],
    snapshotHash, environmentHash, corpusHash, protocol: options.protocol, protocolHash, manifest: options.environment,
    results, summary: summarize(results), negativeResults: negativeResults(results), promotionDecision: null,
    publishable: false,
    evidenceStatus: options.holdout ? 'replication_required' : 'development_only',
    caveat: options.holdout
      ? 'One sealed holdout run is descriptive. No causal promotion or significance claim is emitted.'
      : 'Development corpus run only. It is not holdout evidence and must not be published as an ablation result.'
  };
  await persist(options, receipt);
  return receipt;
}

async function runReplicationCampaign(options) {
  const replications = options.replications;
  if (!Array.isArray(replications) || replications.length < 3) {
    throw new TypeError('ETT holdout replication requires at least three independent runs.');
  }
  if (replications.some((replication) => replication?.holdout !== true)) {
    throw new TypeError('ETT holdout replication cannot include development-corpus runs.');
  }
  const receipts = [];
  for (const replication of replications) receipts.push(await run({ ...replication, kind: 'ett_holdout_replication' }));
  return { campaignId: randomUUID(), replications: receipts.map((item) => item.experimentId),
    count: receipts.length, status: 'descriptive_replication_complete', promotionDecision: null };
}

async function list(options) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
}

module.exports = { CONDITIONS, OUTCOME_METRICS, run, runReplicationCampaign, list, summarize,
  negativeResults };
