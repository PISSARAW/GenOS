'use strict';

/**
 * Run Cycle Driver — executes a full communication cycle:
 * decide → execute (simulate) → learn → assess agency.
 *
 * Bridges communication decisions to actual agent runtime behavior.
 */

const { getDatabase } = require('../../db');
const { decideCommunication, logShadowDecision } = require('./communicationPolicyEngine');
const { learnFromOutcome } = require('./communicationLearningService');
const { assessAgency } = require('./agencyDriver');
const { recordDecision, recordUsefulAction, recordRedundant } = require('./communicationMetricsService');

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

function buildExecutionResult(decision) {
  const recipients = decision.recipients || [];
  const tokensUsed = isVerbal(decision.action) ? estimateTokens(decision) : 0;
  return {
    executed: true,
    simulatedOutcome: {
      actionTaken: decision.action === 'SIGNAL' && recipients.length > 0,
      recipientKnew: recipients.length > 0 && Math.random() > 0.3,
      interpretationCorrect: true,
      tokensUsed,
      channel: decision.encoding,
      recipients: recipients.length
    }
  };
}

async function simulateExecution(decision) {
  if (!decision || decision.action === 'SILENCE') {
    return buildSilenceResult(decision && decision.encoding);
  }
  return buildExecutionResult(decision);
}

async function tryLogShadow(input) {
  try {
    return await logShadowDecision(input);
  } catch (_) {
    return null;
  }
}

function buildLearnQuery(ctx, receiverId) {
  return {
    db: ctx.db, senderId: ctx.intent.senderAgentId, receiverId,
    domain: ctx.intent.domain, semanticRefs: ctx.intent.semanticRefs || [],
    channel: ctx.decision.action, actionTaken: ctx.outcome.actionTaken,
    recipientKnew: ctx.outcome.recipientKnew,
    interpretationCorrect: ctx.outcome.interpretationCorrect,
    tokensUsed: ctx.outcome.tokensUsed
  };
}

async function learnFromReceivers(ctx) {
  let lastResult = null;
  for (const receiverId of ctx.decision.recipients) {
    const query = buildLearnQuery(ctx, receiverId);
    lastResult = await learnFromOutcome(query);
  }
  return lastResult;
}

function updateMetrics(outcome) {
  if (outcome.actionTaken) recordUsefulAction();
  else if (outcome.tokensUsed > 0) recordRedundant();
}

function buildReceipt(ctx) {
  const recipients = ctx.decision.recipients || [];
  return {
    decision: ctx.decision,
    outcome: {
      executed: ctx.outcome.actionTaken !== undefined,
      actionTaken: ctx.outcome.actionTaken || false,
      recipientKnew: ctx.outcome.recipientKnew || false,
      tokensUsed: ctx.outcome.tokensUsed || 0,
      channel: ctx.decision.encoding, recipientCount: recipients.length
    },
    agency: { autonomous: ctx.agency.autonomous, reason: ctx.agency.reason },
    shadow: ctx.shadow,
    utility: (ctx.decision.meta && ctx.decision.meta.utility) || 0,
    cost: (ctx.decision.meta && ctx.decision.meta.cost) || 0
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

  const sim = await simulateExecution(decision);
  const executed = sim.executed;
  const simulatedOutcome = sim.simulatedOutcome;

  let learnResult = null;
  if (executed && decision.recipients && decision.recipients.length > 0) {
    const ctx = { db: resolvedDb, intent, decision, outcome: simulatedOutcome };
    learnResult = await learnFromReceivers(ctx);
    updateMetrics(simulatedOutcome);
  }

  const agency = await assessAgency({
    db: resolvedDb, agentId: intent.senderAgentId, domain: intent.domain
  });

  const outcome = {
    executed, simulatedOutcome, learnResult,
    decisionAction: decision.action,
    recipientCount: (decision.recipients || []).length,
    reasonCodes: decision.reasonCodes || []
  };

  return { decision, outcome, agency, receipt: buildReceipt({ decision, outcome: simulatedOutcome, agency, shadow: shadowReceipt }) };
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
