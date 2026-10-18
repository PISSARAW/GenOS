'use strict';

const crypto = require('node:crypto');

const ADAPTIVE_CONDITION = 'genos-adaptive';
const RIVAL_CONDITIONS = Object.freeze([
  'single-agent',
  'genos-fixed',
  'langgraph-static',
  'autogen-graphflow-swarm',
  'mass-evomas'
]);
const REQUIRED_CONDITIONS = Object.freeze([
  'single-agent',
  'genos-fixed',
  ADAPTIVE_CONDITION,
  'langgraph-static',
  'autogen-graphflow-swarm',
  'mass-evomas'
]);
const EXTERNAL_FRAMEWORKS = Object.freeze({
  'langgraph-static': ['langgraph'],
  'autogen-graphflow-swarm': ['autogen-graphflow', 'autogen-swarm', 'openai-swarm'],
  'mass-evomas': ['mass', 'evomas']
});

function sha(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function normalizedPlan(plan = {}) {
  return {
    alpha: Number(plan.alpha),
    bootstrapSamples: Number(plan.bootstrapSamples),
    minShadowPairs: Number(plan.minShadowPairs),
    minHoldoutPairs: Number(plan.minHoldoutPairs),
    minEffect: Number(plan.minEffect),
    maxCostOverhead: Number(plan.maxCostOverhead),
    seed: Number(plan.seed),
    multiplicityCorrection: plan.multiplicityCorrection
  };
}

function hashStatisticalPlan(plan) {
  return sha(normalizedPlan(plan));
}

function reasonWhen(condition, reason) {
  return condition ? [] : [reason];
}

function planReasons(manifest) {
  const plan = normalizedPlan(manifest?.statisticalPlan);
  return [
    ...reasonWhen(plan.alpha > 0 && plan.alpha <= 0.1, 'invalid_alpha'),
    ...reasonWhen(Number.isSafeInteger(plan.bootstrapSamples) && plan.bootstrapSamples >= 1000,
      'insufficient_bootstrap_samples'),
    ...reasonWhen(Number.isSafeInteger(plan.minShadowPairs) && plan.minShadowPairs >= 1,
      'invalid_shadow_pair_floor'),
    ...reasonWhen(Number.isSafeInteger(plan.minHoldoutPairs) && plan.minHoldoutPairs >= 10,
      'holdout_requires_at_least_ten_pairs'),
    ...reasonWhen(Number.isFinite(plan.minEffect) && plan.minEffect >= 0, 'invalid_minimum_effect'),
    ...reasonWhen(Number.isFinite(plan.maxCostOverhead) && plan.maxCostOverhead >= 0, 'invalid_cost_overhead'),
    ...reasonWhen(Number.isSafeInteger(plan.seed), 'invalid_analysis_seed'),
    ...reasonWhen(plan.multiplicityCorrection === 'bonferroni', 'unsupported_multiplicity_correction'),
    ...reasonWhen(manifest?.statisticalPlanHash === hashStatisticalPlan(plan), 'statistical_plan_hash_mismatch')
  ];
}

function datasetReasons(manifest) {
  const reasons = [];
  const shadow = manifest?.datasets?.shadow;
  const holdout = manifest?.datasets?.holdout;
  const digestPattern = /^sha256:[a-f0-9]{64}$/;
  if (!shadow?.datasetId || !digestPattern.test(shadow?.sha256 || '')) reasons.push('shadow_dataset_not_frozen');
  if (!holdout?.datasetId || !digestPattern.test(holdout?.sha256 || '')) reasons.push('holdout_dataset_not_frozen');
  if (shadow?.datasetId === holdout?.datasetId) reasons.push('shadow_and_holdout_dataset_collision');
  if (holdout?.selectorAccess !== false) reasons.push('holdout_visible_to_selector');
  if (!Number.isFinite(Date.parse(holdout?.sealedAt))) reasons.push('holdout_seal_missing');
  return reasons;
}

function manifestReasons(manifest) {
  const reasons = [...planReasons(manifest), ...datasetReasons(manifest)];
  const registered = Date.parse(manifest?.registeredAt);
  const sealed = Date.parse(manifest?.datasets?.holdout?.sealedAt);
  if (!manifest?.campaignId) reasons.push('campaign_id_missing');
  if (!Number.isFinite(registered)) reasons.push('registration_time_missing');
  if (Number.isFinite(sealed) && Number.isFinite(registered) && sealed > registered) reasons.push('holdout_sealed_after_registration');
  if (manifest?.status !== 'preregistered') reasons.push('campaign_not_preregistered');
  return reasons;
}

function identityReasons(row, manifest) {
  const expectedDataset = manifest?.datasets?.[row?.split]?.datasetId;
  return [
    ...reasonWhen(['shadow', 'holdout'].includes(row?.split), 'invalid_split'),
    ...reasonWhen(REQUIRED_CONDITIONS.includes(row?.conditionId), 'unknown_condition'),
    ...reasonWhen(Boolean(row?.taskId && row?.taskFamily && Number.isSafeInteger(row?.seed)),
      'invalid_pair_identity'),
    ...reasonWhen(Boolean(row?.modelId && row?.oracleId && row?.toolPolicyHash && row?.environmentHash),
      'incomplete_environment_identity'),
    ...reasonWhen(Boolean(expectedDataset && row?.datasetId === expectedDataset), 'dataset_binding_mismatch')
  ];
}

function measurementReasons(row) {
  return [
    ...reasonWhen(Number.isFinite(row?.score) && row.score >= 0 && row.score <= 1, 'invalid_score'),
    ...reasonWhen(Number.isFinite(row?.cost) && row.cost >= 0, 'invalid_cost'),
    ...reasonWhen(Number.isFinite(row?.budgetTokens) && row.budgetTokens > 0, 'invalid_token_budget'),
    ...reasonWhen(Number.isFinite(row?.latencyBudgetMs) && row.latencyBudgetMs > 0, 'invalid_latency_budget'),
    ...reasonWhen(row?.budgetExceeded === false, 'budget_status_not_verified')
  ];
}

function evidenceReasons(row, manifest) {
  const reasons = [];
  if (row?.oracleVerified !== true || row?.executionVerified !== true) reasons.push('attempt_not_verified');
  if (!row?.evidenceRef || !/^sha256:[a-f0-9]{64}$/.test(row?.oracleSha256 || '')) reasons.push('evidence_binding_missing');
  const observed = Date.parse(row?.observedAt);
  if (!Number.isFinite(observed) || observed < Date.parse(manifest?.registeredAt)) reasons.push('attempt_precedes_registration');
  if (row?.realExecution !== true) reasons.push('real_execution_missing');
  return reasons;
}

function provenanceReasons(row) {
  const allowed = EXTERNAL_FRAMEWORKS[row?.conditionId];
  if (!allowed) return ['local-baseline', 'local-runtime'].includes(row?.provenance)
    ? [] : ['invalid_local_provenance'];
  const reasons = [];
  if (row?.provenance !== 'external-paired') reasons.push('external_provenance_missing');
  if (!allowed.includes(row?.framework)) reasons.push('external_framework_mismatch');
  if (!row?.adapterVersion) reasons.push('external_adapter_version_missing');
  return reasons;
}

function observationReasons(row, manifest) {
  return [...identityReasons(row, manifest), ...measurementReasons(row),
    ...evidenceReasons(row, manifest), ...provenanceReasons(row)];
}

function blockKey(row) {
  return `${row.split}::${row.taskId}::${row.seed}`;
}

function buildBlocks(rows) {
  const blocks = new Map();
  for (const row of rows) {
    const key = blockKey(row);
    if (!blocks.has(key)) blocks.set(key, { key, rows: new Map(), duplicates: [] });
    const block = blocks.get(key);
    if (block.rows.has(row.conditionId)) block.duplicates.push(row.conditionId);
    else block.rows.set(row.conditionId, row);
  }
  return [...blocks.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function comparableFields(row) {
  return ['taskFamily', 'modelId', 'budgetTokens', 'latencyBudgetMs', 'oracleId',
    'oracleSha256', 'toolPolicyHash', 'environmentHash'].map(field => row[field]);
}

function blockReasons(block) {
  const reasons = [];
  const rows = [...block.rows.values()];
  const reference = JSON.stringify(comparableFields(rows[0] || {}));
  const missing = REQUIRED_CONDITIONS.filter(condition => !block.rows.has(condition));
  if (missing.length) reasons.push(`missing_conditions:${missing.join(',')}`);
  if (block.duplicates.length) reasons.push(`duplicate_conditions:${[...new Set(block.duplicates)].join(',')}`);
  if (rows.some(row => JSON.stringify(comparableFields(row)) !== reference)) reasons.push('unpaired_environment');
  return reasons;
}

function leakageReasons(rows) {
  const shadow = rows.filter(row => row.split === 'shadow');
  const holdout = rows.filter(row => row.split === 'holdout');
  const taskIds = new Set(shadow.map(row => row.taskId));
  const families = new Set(shadow.map(row => row.taskFamily));
  const reasons = [];
  if (holdout.some(row => taskIds.has(row.taskId))) reasons.push('shadow_holdout_task_leakage');
  if (holdout.some(row => families.has(row.taskFamily))) reasons.push('shadow_holdout_family_leakage');
  return reasons;
}

function randomGenerator(seedText) {
  let state = Number.parseInt(crypto.createHash('sha256').update(seedText).digest('hex').slice(0, 8), 16) || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values, probability) {
  const index = Math.max(0, Math.min(values.length - 1, Math.floor(probability * values.length)));
  return values[index];
}

function bootstrapInterval(values, options) {
  const random = randomGenerator(options.seedText);
  const samples = [];
  for (let sample = 0; sample < options.count; sample += 1) {
    let total = 0;
    for (let draw = 0; draw < values.length; draw += 1) total += values[Math.floor(random() * values.length)];
    samples.push(total / values.length);
  }
  samples.sort((left, right) => left - right);
  return { mean: Number(mean(values).toFixed(6)),
    lower: Number(quantile(samples, options.alpha / 2).toFixed(6)),
    upper: Number(quantile(samples, 1 - options.alpha / 2).toFixed(6)) };
}

function compareRival(blocks, context) {
  const score = blocks.map(block => block.rows.get(ADAPTIVE_CONDITION).score
    - block.rows.get(context.rival).score);
  const cost = blocks.map(block => block.rows.get(ADAPTIVE_CONDITION).cost
    - block.rows.get(context.rival).cost);
  const options = { count: context.plan.bootstrapSamples,
    alpha: context.plan.alpha / RIVAL_CONDITIONS.length,
    seedText: `${context.campaignId}:${context.plan.seed}:${context.rival}` };
  const scoreInterval = bootstrapInterval(score, options);
  const costInterval = bootstrapInterval(cost, { ...options, seedText: `${options.seedText}:cost` });
  const passed = scoreInterval.lower > context.plan.minEffect
    && costInterval.upper <= context.plan.maxCostOverhead;
  return { rival: context.rival, pairCount: blocks.length, scoreDifference: scoreInterval,
    costDifference: costInterval, passed };
}

function thresholdReasons(shadow, holdout, plan) {
  return [
    ...reasonWhen(shadow.length >= plan.minShadowPairs, 'insufficient_shadow_pairs'),
    ...reasonWhen(holdout.length >= plan.minHoldoutPairs, 'insufficient_holdout_pairs')
  ];
}

function campaignComparisons(holdout, manifest, plan) {
  if (planReasons(manifest).length || holdout.length < plan.minHoldoutPairs) return [];
  return RIVAL_CONDITIONS.map(rival => compareRival(holdout,
    { rival, plan, campaignId: manifest.campaignId }));
}

function resultReasons(context) {
  return [...manifestReasons(context.manifest), ...leakageReasons(context.validRows),
    ...reasonWhen(context.invalid.length === 0, 'invalid_observations'),
    ...reasonWhen(context.invalidBlocks.length === 0, 'incomplete_or_unpaired_blocks'),
    ...thresholdReasons(context.shadow, context.holdout, context.plan),
    ...reasonWhen(context.comparisons.every(item => item.passed), 'adaptive_does_not_clear_all_rivals')];
}

function evaluatePairedCampaign(input = {}) {
  const manifest = input.manifest || {};
  const rows = Array.isArray(input.observations) ? input.observations : [];
  const invalid = rows.map(row => ({ row, reasons: observationReasons(row, manifest) }))
    .filter(item => item.reasons.length);
  const validRows = rows.filter(row => !observationReasons(row, manifest).length);
  const blocks = buildBlocks(validRows);
  const invalidBlocks = blocks.map(block => ({ block, reasons: blockReasons(block) }))
    .filter(item => item.reasons.length);
  const complete = blocks.filter(block => !blockReasons(block).length);
  const shadow = complete.filter(block => block.key.startsWith('shadow::'));
  const holdout = complete.filter(block => block.key.startsWith('holdout::'));
  const plan = normalizedPlan(manifest.statisticalPlan);
  const comparisons = campaignComparisons(holdout, manifest, plan);
  const reasons = resultReasons({ manifest, validRows, invalid, invalidBlocks,
    shadow, holdout, plan, comparisons });
  return { schema: 'genos.morphogenesis.paired-campaign-gate/v1',
    status: reasons.length ? 'blocked' : 'eligible', reasons: [...new Set(reasons)],
    requiredConditions: REQUIRED_CONDITIONS, shadowPairCount: shadow.length,
    holdoutPairCount: holdout.length, rejectedObservationCount: invalid.length,
    rejectedBlockCount: invalidBlocks.length, comparisons,
    familyWiseAlpha: Number(plan.alpha || 0), correction: 'bonferroni',
    perComparisonAlpha: Number.isFinite(plan.alpha)
      ? Number((plan.alpha / RIVAL_CONDITIONS.length).toFixed(6)) : null,
    adaptiveCommitEligible: reasons.length === 0,
    commitAuthorized: false, executionAuthorized: false,
    caveat: 'Eligibility is evidence-only; authority, rollback and promotion gates remain mandatory.' };
}

module.exports = { ADAPTIVE_CONDITION, RIVAL_CONDITIONS, REQUIRED_CONDITIONS,
  evaluatePairedCampaign, hashStatisticalPlan };
