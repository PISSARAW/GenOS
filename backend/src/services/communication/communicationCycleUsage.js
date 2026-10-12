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
  if (opts.usageReceipts !== undefined || opts.usageReceipt !== undefined) throw invalidReceipt();
  const batch = result.usageReceipts;
  const single = result.usageReceipt;
  if (batch !== undefined && single !== undefined) throw invalidReceipt();
  if (batch !== undefined && !Array.isArray(batch)) throw invalidReceipt();
  return { receipts: batch ?? (single ? [single] : []), legacy: batch === undefined };
}

function callInventory(input, receipts) {
  if (input.nativeTransport) {
    if (receipts.length || input.result.modelCalls?.length) throw invalidReceipt();
    return { complete: true, source: 'native_transport_no_model_call' };
  }
  return adapterInventory(input.result, receipts);
}

function adapterInventory(result, receipts) {
  const calls = result.modelCalls;
  if (result.modelCallsComplete !== true) {
    return { complete: false, source: 'adapter_reported' };
  }
  if (!Array.isArray(calls) || calls.some((id) => typeof id !== 'string' || !id)) {
    throw invalidReceipt();
  }
  const reported = new Set(receipts.map((item) => item.responseId));
  if (new Set(calls).size !== calls.length || calls.length !== reported.size
    || calls.some((id) => !reported.has(id))) throw invalidReceipt();
  return { complete: true, source: 'adapter_reported' };
}

function receiptTotals(receipts) {
  return receipts.reduce((totals, item) => ({ input: totals.input + item.inputTokens,
    output: totals.output + item.outputTokens }), { input: 0, output: 0 });
}

function fillCompleteUsage(entries) {
  for (const entry of entries.values()) {
    entry.generationTokens ??= 0;
    entry.controlTokens ??= 0;
  }
}

function recordUsage(input) {
  const { receipts, decision, inventory } = input;
  const totals = receiptTotals(receipts);
  if (receipts.length || inventory.complete) {
    recordTokens({ tokensInput: totals.input, tokensOutput: totals.output });
  }
  const projected = receipts.length ? 0 : projectedTokens(decision);
  if (projected) recordTokens({ measured: false, tokensProjected: projected });
  return { totals, projected };
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

function summarizeUsage(input) {
  const { receipts, inventory, totals, projected, byId } = input;
  const reported = receipts.length > 0;
  const measured = inventory.complete || reported;
  const tokenStatus = inventory.source === 'native_transport_no_model_call'
    ? 'no_model_call' : reported ? 'provider_reported' : 'unknown';
  const tokenCoverage = inventory.complete ? 'complete'
    : reported ? 'reported_lower_bound' : 'unmeasured';
  return { tokensUsed: measured ? totals.input + totals.output : null,
    tokensProjected: projected, tokensMeasured: measured,
    usageReceiptId: receipts.length === 1 ? receipts[0].responseId : null,
    tokenStatus, tokenCoverage, usageProvenance: inventory.source,
    participantUsage: [...byId.values()] };
}

function measureCycleUsage(input) {
  const { decision, intent, cycleId } = input;
  const normalized = normalizeReceipts(input);
  const ids = [...new Set([intent.senderAgentId, ...(decision.recipients || [])])];
  const byId = new Map(ids.map((id) => [id, participantEntry(id)]));
  const context = { sender: intent.senderAgentId, cycleId, participants: new Set(ids),
    responseIds: new Set(), legacy: normalized.legacy };
  const receipts = normalized.receipts.map((receipt) => assertReceipt(receipt, context));
  const inventory = callInventory(input, receipts);
  for (const receipt of receipts) addReceipt(byId.get(receipt.participantAgentId), receipt);
  if (inventory.complete) fillCompleteUsage(byId);
  const { totals, projected } = recordUsage({ receipts, decision, inventory });
  return summarizeUsage({ receipts, inventory, totals, projected, byId });
}

function projectedTokens(decision) {
  if (!['MICRO_UTTERANCE', 'DIALOGUE', 'HUMAN'].includes(decision.action)) return 0;
  return Math.ceil((decision.meta?.cost || 0.4) * 500);
}

module.exports = { measureCycleUsage };
