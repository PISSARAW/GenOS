'use strict';

const MODES = ['solo', 'genos'];
const RESOURCES = ['tokens', 'cost_usd', 'latency_ms', 'tool_calls', 'tool_failures', 'retries', 'human_interventions', 'topology_transitions'];
const METRIC_KEYS = {
  cost_usd: 'cost', latency_ms: 'latencyMs', tool_calls: 'toolCalls',
  tool_failures: 'toolFailures', human_interventions: 'humanInterventions',
  topology_transitions: 'topologyTransitions'
};

function numeric(run, key) {
  const value = run[key] ?? run[METRIC_KEYS[key]] ?? run.metrics?.[key] ?? run.metrics?.[METRIC_KEYS[key]];
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ? Number(value) : null;
}

function receipts(run) {
  if (Array.isArray(run.verifierReceipts)) return run.verifierReceipts;
  if (Array.isArray(run.verifier_receipts)) return run.verifier_receipts;
  const receipt = run.verificationReceipt || run.verification_receipt;
  return receipt ? [receipt] : [];
}

function hasReceipt(run) {
  return receipts(run).some((receipt) => receipt?.validation?.valid === true
    && ['VERIFIED', 'REFUTED', 'INCONCLUSIVE', 'UNAVAILABLE'].includes(receiptResult(receipt)));
}

function isVerified(run) {
  const entries = receipts(run);
  return entries.length > 0 && entries.every((receipt) => receiptResult(receipt) === 'VERIFIED'
    && Boolean(receipt.verifierDigest || receipt.verifierId)
    && receipt.validation?.valid === true);
}

function receiptResult(receipt) {
  const result = receipt?.result || receipt?.status;
  return typeof result === 'string' ? result.toUpperCase() : '';
}

function isPromoted(run) {
  const status = run.promotionDecision?.status || run.promotion_decision?.status || run.promotion_status;
  return typeof status === 'string' && status.toUpperCase() === 'PROMOTE';
}

function meanFor(runs, key) {
  const values = runs.map((run) => numeric(run, key)).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sumFor(runs, key) {
  const values = runs.map((run) => numeric(run, key)).filter((value) => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function rate(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function promotedRuns(runs) {
  return runs.filter(isPromoted);
}

function verifiedSuccesses(runs) {
  const measured = runs.filter((run) => ['success', 'failure', 'inconclusive', 'error'].includes(run.finalOutcome));
  return measured.length ? measured.filter((run) => run.finalOutcome === 'success' && isVerified(run)).length : null;
}

function successPerBudget(runs, resource) {
  const budget = sumFor(runs, resource);
  const successes = verifiedSuccesses(runs);
  return budget === null || budget <= 0 || successes === null ? null : successes / budget;
}

function summarizeMode(runs) {
  const promoted = promotedRuns(runs);
  const promotionsWithoutVerifiedReceipt = promoted.filter((run) => !isVerified(run)).length;
  const reproducibility = runs.filter((run) => typeof run.reproducibility?.reproduced === 'boolean');
  const result = {
    attempts: runs.length,
    correctness: meanFor(runs, 'score'),
    verificationCoverage: rate(runs.filter(hasReceipt).length, runs.length),
    falsePromotionRate: rate(promotionsWithoutVerifiedReceipt, promoted.length),
    verifiedSuccesses: verifiedSuccesses(runs),
    successPerToken: successPerBudget(runs, 'tokens'),
    successPerDollar: successPerBudget(runs, 'cost_usd'),
    successPerSecond: successPerBudget(runs, 'latency_ms'),
    reproducibilityRate: rate(reproducibility.filter((run) => run.reproducibility.reproduced).length, reproducibility.length)
  };
  for (const key of RESOURCES) result[`mean_${key}`] = meanFor(runs, key);
  result.toolFailures = sumFor(runs, 'tool_failures');
  return result;
}

function summarizeTierMetrics(runs, baseModel) {
  const selected = (runs || []).filter((run) => run.model === baseModel && MODES.includes(run.mode));
  const byMode = Object.fromEntries(MODES.map((mode) => [mode, summarizeMode(selected.filter((run) => run.mode === mode))]));
  return {
    byMode,
    definitions: {
      falsePromotionRate: 'explicit PROMOTE decisions lacking all-VERIFIED receipts marked validation.valid=true, divided by explicit PROMOTE decisions; null when there are none',
      verificationCoverage: 'attempts with at least one receipt validated at ingestion and carrying a recognized result, divided by attempts',
      verifiedSuccess: 'explicit successful finalOutcome with every attached receipt marked VERIFIED and validation.valid=true'
    },
    kind: 'metric',
    qualityGuarantee: false
  };
}

module.exports = { summarizeTierMetrics };
