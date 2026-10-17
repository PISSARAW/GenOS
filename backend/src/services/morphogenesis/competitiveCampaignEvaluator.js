'use strict';

const crypto = require('node:crypto');
const evidenceAudit = require('../trinityEvidenceAudit');

const SCHEMA = 'genos-morphogenesis-competitive-campaign-v1';
const SYSTEMS = Object.freeze(['genos', 'langgraph', 'magentic', 'aflow', 'dylan']);
const MIN_TASKS = 10;

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function observationBody(row) {
  return Object.fromEntries(['taskId', 'seed', 'system', 'quality', 'tokens', 'latencyMs',
    'budgetTokens', 'latencyBudgetMs', 'modelId', 'toolPolicyHash', 'datasetDigest',
    'adapterDigest', 'runtimeVersion']
    .map((key) => [key, row[key]]));
}

function receiptValid(receipt, resultId, evidenceDigest) {
  return evidenceAudit.isVerifiedReceipt(receipt) && receipt.resultId === resultId
    && receipt.evidenceDigest === evidenceDigest;
}

function validIdentity(row) {
  return typeof row?.id === 'string' && typeof row.taskId === 'string'
    && Number.isSafeInteger(row.seed) && SYSTEMS.includes(row.system)
    && ['modelId', 'toolPolicyHash', 'runtimeVersion'].every((key) =>
      typeof row[key] === 'string' && row[key].length > 0)
    && /^sha256:[0-9a-f]{64}$/i.test(row.datasetDigest)
    && /^sha256:[0-9a-f]{64}$/i.test(row.adapterDigest);
}

function validMeasurements(row) {
  return [within(row.quality, 0, 1), positive(row.budgetTokens),
    positive(row.latencyBudgetMs), within(row.tokens, 0, row.budgetTokens),
    within(row.latencyMs, 0, row.latencyBudgetMs)].every(Boolean);
}

function within(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function positive(value) { return Number.isFinite(value) && value > 0; }

function validObservation(row) {
  if (!validIdentity(row) || !validMeasurements(row)) return false;
  const executionDigest = digest(observationBody(row));
  const oracleDigest = digest({ id: row.id, taskId: row.taskId, quality: row.quality,
    datasetDigest: row.datasetDigest });
  return receiptValid(row.executionReceipt, row.id, executionDigest)
    && receiptValid(row.oracleReceipt, `${row.id}:oracle`, oracleDigest)
    && row.executionReceipt.independenceDescriptor.workspaceId
      !== row.oracleReceipt.independenceDescriptor.workspaceId;
}

function taskKey(row) { return `${row.taskId}\u0000${row.seed}`; }

function commonContract(rows) {
  const values = rows.map((row) => [row.modelId, row.toolPolicyHash, row.datasetDigest,
    row.budgetTokens, row.latencyBudgetMs].join('\u0000'));
  return new Set(values).size === 1;
}

function completeTasks(rows) {
  const grouped = new Map();
  rows.forEach((row) => grouped.set(taskKey(row), [...(grouped.get(taskKey(row)) || []), row]));
  return [...grouped.values()].filter((taskRows) => taskRows.length === SYSTEMS.length
    && new Set(taskRows.map((row) => row.system)).size === SYSTEMS.length
    && commonContract(taskRows));
}

function pairedSummary(tasks, rival) {
  const differences = tasks.map((rows) => {
    const genos = rows.find((row) => row.system === 'genos');
    const baseline = rows.find((row) => row.system === rival);
    return genos.quality - baseline.quality;
  });
  const mean = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  const variance = differences.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    / differences.length;
  const uncertainty = 2.5 * Math.sqrt(variance / differences.length);
  return { rival, taskCount: differences.length, meanQualityDifference: Number(mean.toFixed(6)),
    uncertainty: Number(uncertainty.toFixed(6)), lowerBound: Number((mean - uncertainty).toFixed(6)),
    multiplicityCorrection: 'bonferroni-four-comparisons' };
}

function evaluate(campaign = {}) {
  const supplied = Array.isArray(campaign.observations) ? campaign.observations : [];
  const valid = supplied.filter(validObservation);
  const tasks = completeTasks(valid);
  const base = { schemaVersion: SCHEMA, suppliedObservations: supplied.length,
    verifiedObservations: valid.length, commonTaskCount: tasks.length,
    systems: SYSTEMS, externalValidity: 'observed_campaign_only' };
  if (campaign.schemaVersion !== SCHEMA || tasks.length < MIN_TASKS) {
    return { ...base, status: 'not_observed', claimable: false,
      reason: campaign.schemaVersion !== SCHEMA ? 'campaign_schema_invalid'
        : 'at_least_ten_common_verified_tasks_required', comparisons: [] };
  }
  const comparisons = SYSTEMS.filter((system) => system !== 'genos')
    .map((system) => pairedSummary(tasks, system));
  const qualified = comparisons.every((item) => item.lowerBound > 0);
  return { ...base, status: qualified ? 'qualified' : 'inconclusive',
    claimable: qualified, comparisons,
    claim: qualified ? 'genos_superior_on_this_verified_common_campaign_only'
      : 'no_superiority_demonstrated' };
}

module.exports = { SCHEMA, SYSTEMS, MIN_TASKS, digest, observationBody,
  validObservation, evaluate };
