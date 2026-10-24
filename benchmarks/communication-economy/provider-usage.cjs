'use strict';

const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'cachedInputTokens'];

function validTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertUsageReceipt(receipt) {
  const identity = ['runId', 'armId', 'taskId', 'agentId', 'responseId', 'provider', 'model'];
  if (!receipt || identity.some((key) => typeof receipt[key] !== 'string' || !receipt[key])) {
    throw new Error('Provider usage receipt is missing benchmark identity.');
  }
  if (TOKEN_FIELDS.slice(0, 2).some((key) => !validTokenCount(receipt[key]))) {
    throw new Error('Provider usage receipt requires measured input and output token counts.');
  }
  if (receipt.cachedInputTokens !== undefined && !validTokenCount(receipt.cachedInputTokens)) {
    throw new Error('Cached input token count must be a non-negative integer.');
  }
  if (receipt.costUsd !== undefined && receipt.costUsd !== null
    && (!Number.isFinite(receipt.costUsd) || receipt.costUsd < 0)) {
    throw new Error('Provider cost must be a non-negative number.');
  }
  return { ...receipt, cachedInputTokens: receipt.cachedInputTokens || 0,
    costUsd: receipt.costUsd ?? null, usageSource: 'provider-reported' };
}

function validateInventory(receipts, inventory) {
  if (!inventory || inventory.complete !== true || !Array.isArray(inventory.callIds)) return false;
  const actual = receipts.map((receipt) => receipt.responseId);
  return new Set(actual).size === actual.length
    && new Set(inventory.callIds).size === inventory.callIds.length
    && actual.length === inventory.callIds.length
    && actual.every((id) => inventory.callIds.includes(id));
}

function summarizeUsage(receipts, inventory) {
  const rows = receipts.map(assertUsageReceipt);
  const totals = rows.reduce((sum, row) => ({
    inputTokens: sum.inputTokens + row.inputTokens,
    outputTokens: sum.outputTokens + row.outputTokens,
    cachedInputTokens: sum.cachedInputTokens + row.cachedInputTokens,
    costUsd: sum.costUsd === null || row.costUsd === null ? null : sum.costUsd + row.costUsd
  }), { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0 });
  return { ...totals, calls: rows.length,
    usageCoverage: validateInventory(rows, inventory) ? 'complete' : 'lower-bound',
    usageMeasured: rows.length > 0 || inventory?.complete === true,
    receipts: rows };
}

module.exports = { assertUsageReceipt, summarizeUsage, validateInventory };
