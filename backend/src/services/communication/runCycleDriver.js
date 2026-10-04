'use strict';

/**
 * Run Cycle Driver — executes a full communication cycle:
 * decide → execute (simulate) → learn → assess agency.
 *
 * Bridges communication decisions to actual agent runtime behavior.
 */

const { getDatabase } = require('../../db');
const { decideCommunication, logShadowDecision } = require('./communicationPolicyEngine');
const { assessAgency } = require('./agencyDriver');
const { recordDecision } = require('./communicationMetricsService');

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

const VERBAL_ACTIONS = new Set(['MICRO_UTTERANCE', 'DIALOGUE', 'HUMAN']);

function isVerbal(action) {
  return VERBAL_ACTIONS.has(action);
}

function buildSilenceResult(encoding) {
  return {
    executed: false,
    simulated: true,
    simulatedOutcome: {
      actionTaken: false, recipientKnew: false,
      interpretationCorrect: true, tokensUsed: 0, channel: encoding
    }
  };
}

function estimateTokens(decision) {
  if (decision.meta && decision.meta.cost) return Math.ceil(decision.meta.cost * 500);
  return 200;
}

function tokenAccounting(decision, usageReceipt) {
  if (!isVerbal(decision.action)) return { tokensUsed: 0, tokensProjected: 0, tokensMeasured: false };
  const receipt = normalizeUsageReceipt(usageReceipt);
  if (receipt) return { tokensUsed: receipt.inputTokens + receipt.outputTokens,
    tokensProjected: 0, tokensMeasured: true, usageReceiptId: receipt.responseId };
  return { tokensUsed: 0, tokensProjected: estimateTokens(decision), tokensMeasured: false };
}

function normalizeUsageReceipt(receipt) {
  if (receipt === undefined || receipt === null) return null;
  const valid = receipt.apiVersion === 'genos.communication-usage/v1'
    && receipt.source === 'model-provider' && typeof receipt.responseId === 'string'
    && Number.isSafeInteger(receipt.inputTokens) && receipt.inputTokens >= 0
    && Number.isSafeInteger(receipt.outputTokens) && receipt.outputTokens >= 0;
  if (!valid) throw Object.assign(new Error('Invalid provider token-usage receipt.'), { code: 'COMMUNICATION_USAGE_RECEIPT_INVALID' });
  return receipt;
}

function buildExecutionResult(decision, usageReceipt) {
  const recipients = decision.recipients || [];
  const usage = tokenAccounting(decision, usageReceipt);
  return {
    executed: false,
    simulated: true,
    simulatedOutcome: {
      actionTaken: decision.action === 'SIGNAL' && recipients.length > 0,
      recipientKnew: recipients.length > 0 && Math.random() > 0.3,
      interpretationCorrect: true,
      ...usage,
      channel: decision.encoding,
      recipients: recipients.length
    }
  };
}

async function simulateExecution(decision, usageReceipt) {
  if (!decision || decision.action === 'SILENCE') {
    return buildSilenceResult(decision && decision.encoding);
  }
  return buildExecutionResult(decision, usageReceipt);
}

async function tryLogShadow(input) {
  try {
    return await logShadowDecision(input);
  } catch (_) {
    return null;
  }
}

function buildReceipt(ctx) {
  return {
    decision: ctx.decision,
    outcome: receiptOutcome(ctx),
    agency: { autonomous: ctx.agency.autonomous, reason: ctx.agency.reason },
    shadow: ctx.shadow,
    utility: (ctx.decision.meta && ctx.decision.meta.utility) || 0,
    cost: (ctx.decision.meta && ctx.decision.meta.cost) || 0
  };
}

function receiptOutcome(ctx) {
  const recipients = ctx.decision.recipients || [];
  return {
    executed: false,
    simulated: true,
    actionTaken: null,
    recipientKnew: null,
    tokensUsed: 0,
    tokensProjected: 0,
    tokensMeasured: false,
    usageReceiptId: null,
    channel: ctx.decision.encoding, recipientCount: recipients.length
  };
}

function buildInput(intent, resolvedDb, opts) {
  return {
    db: resolvedDb, intent,
    maxCost: opts.maxCost || 1.0,
    maxCandidates: opts.maxCandidates || 5,
    coefficients: opts.coefficients,
    dialectAvailable: opts.dialectAvailable !== false,
    trigger: opts.trigger, ttlMs: opts.ttlMs || 60000
  };
}

async function runCycle(params) {
  const { db, intent, opts = {} } = params;
  if (!intent) throw new Error('runCycle: intent is required.');
  if (!intent.senderAgentId) throw new Error('runCycle: intent.senderAgentId is required.');

  const resolvedDb = await resolveDb(db);
  const input = buildInput(intent, resolvedDb, opts);

  const decision = await decideCommunication(input);
  recordDecision(decision);

  const shadowReceipt = await tryLogShadow(input);

  const simulation = await simulateExecution(decision, opts.usageReceipt);
  const simulatedOutcome = simulation.simulatedOutcome;

  const agency = await assessAgency({
    db: resolvedDb, agentId: intent.senderAgentId, domain: intent.domain
  });

  const outcome = {
    executed: false, simulated: true, simulatedOutcome, learnResult: null,
    decisionAction: decision.action,
    recipientCount: (decision.recipients || []).length,
    reasonCodes: decision.reasonCodes || []
  };

  return { decision, outcome, agency, receipt: buildReceipt({ decision, outcome, agency, shadow: shadowReceipt }) };
}

async function runCycleBatch(cycles, globalOpts = {}) {
  const results = [];
  for (const c of cycles) {
    const result = await runCycle({ db: globalOpts.db, intent: c.intent, opts: c.opts || {} });
    results.push(result);
  }
  return results;
}

module.exports = { runCycle, runCycleBatch, simulateExecution };
