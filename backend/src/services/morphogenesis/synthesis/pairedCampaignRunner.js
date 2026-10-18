'use strict';

const { evaluatePairedCampaign, REQUIRED_CONDITIONS,
  validateCampaignManifest } = require('./pairedCampaignGate');
const { PairedCampaignStore, shaJson } = require('./pairedCampaignStore');
const { executeProcessAdapter, validateConfig } = require('./processCampaignAdapter');

function datasetReasons(dataset, descriptor, split) {
  const reasons = [];
  if (dataset?.schema !== 'genos.morphogenesis.p3-dataset/v1') reasons.push(`${split}_schema_invalid`);
  if (dataset?.split !== split || dataset?.datasetId !== descriptor?.datasetId) reasons.push(`${split}_identity_mismatch`);
  if (shaJson(dataset) !== descriptor?.sha256) reasons.push(`${split}_digest_mismatch`);
  if (!Array.isArray(dataset?.tasks) || !dataset.tasks.length) reasons.push(`${split}_tasks_missing`);
  if (split === 'holdout' && dataset?.selectorAccess !== false) reasons.push('holdout_visible_to_selector');
  return reasons;
}

function taskReasons(task) {
  const reasons = [];
  if (!task?.taskId || !task?.taskFamily || !task?.prompt) reasons.push('task_identity_incomplete');
  if (!task?.oracleId || !/^sha256:[a-f0-9]{64}$/.test(task?.oracleSha256 || '')) reasons.push('task_oracle_incomplete');
  if (!Array.isArray(task?.seeds) || !task.seeds.length
    || task.seeds.some(seed => !Number.isSafeInteger(seed))) reasons.push('task_seeds_invalid');
  return reasons;
}

function executionReasons(execution) {
  return [
    [Boolean(execution?.modelId), 'model_id_missing'],
    [Number.isFinite(execution?.budgetTokens) && execution.budgetTokens > 0, 'token_budget_invalid'],
    [Number.isFinite(execution?.latencyBudgetMs) && execution.latencyBudgetMs > 0, 'latency_budget_invalid'],
    [Boolean(execution?.toolPolicyHash), 'tool_policy_hash_missing'],
    [Boolean(execution?.environmentHash), 'environment_hash_missing']
  ].filter(item => !item[0]).map(item => item[1]);
}

function validateDataset(dataset, descriptor, split) {
  const reasons = datasetReasons(dataset, descriptor, split);
  for (const task of dataset?.tasks || []) reasons.push(...taskReasons(task));
  const keys = (dataset?.tasks || []).flatMap(task => (task.seeds || [])
    .map(seed => `${task.taskId}:${seed}`));
  if (new Set(keys).size !== keys.length) reasons.push(`${split}_duplicate_blocks`);
  return reasons;
}

function validateAdapters(input) {
  const reasons = [];
  for (const conditionId of REQUIRED_CONDITIONS) {
    try { input.validator(input.adapters?.[conditionId], conditionId); }
    catch (error) { reasons.push(`${conditionId}:${error.message}`); }
  }
  return reasons;
}

function assertRunnable(input) {
  const descriptor = input.manifest?.datasets?.[input.phase];
  const reasons = [...validateCampaignManifest(input.manifest),
    ...validateDataset(input.dataset, descriptor, input.phase),
    ...executionReasons(input.manifest?.execution), ...validateAdapters(input)];
  if (!['shadow', 'holdout'].includes(input.phase)) reasons.push('phase_invalid');
  if (reasons.length) throw new Error(`P3 campaign is not runnable: ${[...new Set(reasons)].join(',')}.`);
}

function attemptIdentity(input) {
  return { split: input.phase, datasetId: input.dataset.datasetId,
    taskId: input.task.taskId, seed: input.seed, conditionId: input.conditionId };
}

function adapterRequest(input) {
  const execution = input.manifest.execution;
  const body = { schema: 'genos.morphogenesis.p3-adapter-request/v1', attemptId: input.attemptId,
    conditionId: input.conditionId, mission: input.task.prompt, seed: input.seed,
    modelId: execution.modelId, budgetTokens: execution.budgetTokens,
    latencyBudgetMs: execution.latencyBudgetMs, toolPolicyHash: execution.toolPolicyHash,
    environmentHash: execution.environmentHash };
  return { ...body, inputHash: shaJson(body) };
}

function orderedAttempts(input) {
  const attempts = [];
  for (const task of input.dataset.tasks) for (const seed of task.seeds) {
    const conditions = [...REQUIRED_CONDITIONS].sort((left, right) => shaJson({ task: task.taskId, seed, condition: left })
      .localeCompare(shaJson({ task: task.taskId, seed, condition: right })));
    for (const conditionId of conditions) attempts.push({ task, seed, conditionId });
  }
  return attempts;
}

function normalizeOracle(result) {
  const score = Number(result?.score);
  if (result?.verified !== true || !Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error('Independent oracle returned an invalid verified score.');
  }
  return { verified: true, score, details: result.details || null };
}

function observationBase(input) {
  const execution = input.manifest.execution;
  return { split: input.phase, conditionId: input.conditionId,
    taskId: input.task.taskId, taskFamily: input.task.taskFamily, seed: input.seed,
    datasetId: input.dataset.datasetId, modelId: execution.modelId,
    budgetTokens: execution.budgetTokens, latencyBudgetMs: execution.latencyBudgetMs,
    oracleId: input.task.oracleId, oracleSha256: input.task.oracleSha256,
    toolPolicyHash: execution.toolPolicyHash, environmentHash: execution.environmentHash,
    evidenceRef: `attempt:${input.attemptId}`, observedAt: input.observedAt };
}

function successObservation(input) {
  const adapter = input.adapterResult;
  const executionVerified = input.trustedInvoker === true && adapter.executionVerified === true;
  return { ...observationBase(input), score: input.oracle.score, cost: adapter.metrics.cost,
    budgetExceeded: adapter.budgetExceeded === true, oracleVerified: true,
    executionVerified, realExecution: executionVerified && adapter.realExecution === true,
    provenance: adapter.provenance, framework: adapter.framework,
    adapterVersion: adapter.adapterVersion };
}

function failureObservation(input) {
  const config = input.adapters[input.conditionId] || {};
  return { ...observationBase(input), score: 0, cost: 0, budgetExceeded: true,
    oracleVerified: false, executionVerified: false, realExecution: false,
    provenance: config.provenance || 'invalid', framework: config.framework || null,
    adapterVersion: config.adapterVersion || null };
}

function receiptRecord(input) {
  return { schema: 'genos.morphogenesis.p3-attempt/v1', campaignId: input.manifest.campaignId,
    attemptId: input.attemptId, inputHash: input.request.inputHash, status: input.status,
    observation: input.observation, oracle: input.oracle || null,
    adapterReceipt: input.adapterResult?.adapterReceipt || null, error: input.error || null };
}

async function executeAttempt(input) {
  const identity = attemptIdentity(input);
  const attemptId = input.store.attemptId(identity);
  const request = adapterRequest({ ...input, attemptId });
  const leaseResult = input.store.acquireLease({ attemptId, inputHash: request.inputHash,
    now: input.now(), ttlMs: input.leaseTtlMs });
  if (leaseResult.status === 'completed') return { ...leaseResult.receipt, cacheHit: true };
  if (leaseResult.status === 'leased') return { pending: true, attemptId };
  const common = { ...input, attemptId, request, observedAt: input.now() };
  let record;
  try {
    const adapterResult = await input.invoker({ config: input.adapters[input.conditionId], request });
    const oracle = normalizeOracle(await input.oracleEvaluator({ task: input.task,
      candidate: adapterResult.candidate }));
    const observation = successObservation({ ...common, adapterResult, oracle });
    record = receiptRecord({ ...common, status: 'completed', adapterResult, oracle, observation });
  } catch (error) {
    const observation = failureObservation(common);
    record = receiptRecord({ ...common, status: 'failed', observation, error: error.message });
  }
  const committed = input.store.commitReceipt({ attemptId, inputHash: request.inputHash,
    leaseToken: leaseResult.lease.leaseToken, receipt: record });
  return { ...committed, cacheHit: false };
}

async function executeAll(input) {
  const receipts = [];
  for (const attempt of orderedAttempts(input)) receipts.push(await executeAttempt({ ...input, ...attempt }));
  return receipts;
}

async function runPairedCampaignPhase(options = {}) {
  const input = { ...options, validator: options.adapterValidator || validateConfig,
    invoker: options.adapterInvoker || executeProcessAdapter,
    trustedInvoker: options.adapterInvoker === undefined,
    now: options.now || (() => new Date().toISOString()), leaseTtlMs: options.leaseTtlMs || 300000 };
  assertRunnable(input);
  const store = options.store || new PairedCampaignStore({ root: options.storeRoot,
    campaignId: input.manifest.campaignId });
  store.initialize(input.manifest);
  if (input.phase === 'holdout' && !store.readSeal('shadow')) {
    throw new Error('Holdout execution requires a sealed shadow split.');
  }
  const receipts = await executeAll({ ...input, store });
  const pending = receipts.filter(item => item.pending).length;
  const expectedCount = orderedAttempts(input).length;
  const seal = pending ? null : store.sealSplit({ split: input.phase, expectedCount });
  const observations = store.listReceipts().map(item => item.observation);
  const gate = evaluatePairedCampaign({ manifest: input.manifest, observations });
  return { schema: 'genos.morphogenesis.p3-run/v1', campaignId: input.manifest.campaignId,
    phase: input.phase, expectedAttemptCount: expectedCount, terminalAttemptCount: receipts.length - pending,
    resumedAttemptCount: receipts.filter(item => item.cacheHit === true).length,
    pendingAttemptCount: pending, splitSeal: seal, gate,
    adaptiveCommitEligible: gate.adaptiveCommitEligible,
    commitAuthorized: false, executionAuthorized: false };
}

module.exports = { runPairedCampaignPhase, shaDataset: shaJson, validateDataset };
