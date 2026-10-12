'use strict';

const { recordTokens } = require('./communicationMetricsService');

function invalidReceipt() {
  return Object.assign(new Error('Uncorrelated provider token-usage receipt.'),
    { code: 'COMMUNICATION_USAGE_RECEIPT_INVALID' });
}

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizeReceipts(input) {
  const { result, opts } = input;
  const batch = result.usageReceipts ?? opts.usageReceipts;
  const single = result.usageReceipt ?? opts.usageReceipt;
  if (batch !== undefined && single !== undefined) throw invalidReceipt();
  if (batch !== undefined && !Array.isArray(batch)) throw invalidReceipt();
  return { receipts: batch ?? (single ? [single] : []), legacy: batch === undefined };
}

function validIdentity(receipt, context, target) {
  return receipt.apiVersion === 'genos.communication-usage/v1'
    && receipt.source === 'model-provider' && receipt.cycleId === context.cycleId
    && typeof receipt.responseId === 'string' && receipt.responseId.length > 0
    && context.participants.has(target.participant)
    && ['generation', 'control'].includes(target.phase)
    && !context.responseIds.has(receipt.responseId);
}

function assertReceipt(receipt, context) {
  const participant = receipt.participantAgentId || (context.legacy ? context.sender : null);
  const phase = receipt.phase || (context.legacy ? 'generation' : null);
  if (!validIdentity(receipt, context, { participant, phase })
    || !validCount(receipt.inputTokens) || !validCount(receipt.outputTokens)) throw invalidReceipt();
  context.responseIds.add(receipt.responseId);
  return { ...receipt, participantAgentId: participant, phase };
}

function participantEntry(id) {
  return { agentId: id, generationTokens: null, controlTokens: null,
    generationReceiptIds: [], controlReceiptIds: [] };
}

function addReceipt(entry, receipt) {
  const field = receipt.phase === 'control' ? 'controlTokens' : 'generationTokens';
  const ids = receipt.phase === 'control' ? 'controlReceiptIds' : 'generationReceiptIds';
  entry[field] = (entry[field] || 0) + receipt.inputTokens + receipt.outputTokens;
  entry[ids].push(receipt.responseId);
}

function measureCycleUsage(input) {
  const { decision, intent, cycleId } = input;
  const normalized = normalizeReceipts(input);
  const ids = [...new Set([intent.senderAgentId, ...(decision.recipients || [])])];
  const byId = new Map(ids.map((id) => [id, participantEntry(id)]));
  const context = { sender: intent.senderAgentId, cycleId, participants: new Set(ids),
    responseIds: new Set(), legacy: normalized.legacy };
  const receipts = normalized.receipts.map((receipt) => assertReceipt(receipt, context));
  for (const receipt of receipts) addReceipt(byId.get(receipt.participantAgentId), receipt);
  if (receipts.length) {
    recordTokens({ tokensInput: receipts.reduce((sum, item) => sum + item.inputTokens, 0),
      tokensOutput: receipts.reduce((sum, item) => sum + item.outputTokens, 0) });
  }
  const projected = receipts.length ? 0 : projectedTokens(decision);
  if (projected) recordTokens({ measured: false, tokensProjected: projected });
  return { tokensUsed: receipts.length
    ? receipts.reduce((sum, item) => sum + item.inputTokens + item.outputTokens, 0) : null,
  tokensProjected: projected, tokensMeasured: receipts.length > 0,
  usageReceiptId: receipts.length === 1 ? receipts[0].responseId : null,
  tokenStatus: receipts.length ? 'provider_reported_partial' : 'unknown',
  tokenCoverage: receipts.length ? 'reported_lower_bound' : 'unmeasured',
  participantUsage: [...byId.values()] };
}

function projectedTokens(decision) {
  if (!['MICRO_UTTERANCE', 'DIALOGUE', 'HUMAN'].includes(decision.action)) return 0;
  return Math.ceil((decision.meta?.cost || 0.4) * 500);
}

module.exports = { measureCycleUsage };
