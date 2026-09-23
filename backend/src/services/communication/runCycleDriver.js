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

/**
 * Simulate execution of a communication decision.
 * @param {object} decision — from decideCommunication
 * @param {object} intent — the original intent
 * @returns {Promise<{ executed: boolean, simulatedOutcome: object }>}
 */
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

async function learnFromCycle(db, intent, decision, simulatedOutcome) {
  const results = [];
  for (const receiverId of decision.recipients) {
    const result = await learnFromOutcome({
      db, senderId: intent.senderAgentId, receiverId,
      domain: intent.domain, semanticRefs: intent.semanticRefs || [],
      channel: decision.action, actionTaken: simulatedOutcome.actionTaken,
      recipientKnew: simulatedOutcome.recipientKnew,
      interpretationCorrect: simulatedOutcome.interpretationCorrect,
      tokensUsed: simulatedOutcome.tokensUsed
    });
    results.push(result);
  }
  return results.pop() || null;
}

/**
 * Execute a full communication cycle.
 * @param {object} params — { db, intent, opts }
 */
async function runCycle({ db, intent, opts = {} }) {
  if (!intent) throw new Error('runCycle: intent is required.');
  if (!intent.senderAgentId) throw new Error('runCycle: intent.senderAgentId is required.');

  const resolvedDb = await resolveDb(db);
  const input = {
    db: resolvedDb, intent,
    maxCost: opts.maxCost || 1.0,
    maxCandidates: opts.maxCandidates || 5,
    coefficients: opts.coefficients,
    dialectAvailable: opts.dialectAvailable !== false,
    trigger: opts.trigger, ttlMs: opts.ttlMs || 60000
  };

  const decision = await decideCommunication(input);
  recordDecision(decision);

  const shadowReceipt = await tryLogShadow(input);

  const sim = await simulateExecution(decision, intent);
  const executed = sim.executed;
  const simulatedOutcome = sim.simulatedOutcome;

  let learnResult = null;
  if (executed && decision.recipients && decision.recipients.length > 0) {
    learnResult = await learnFromCycle(resolvedDb, intent, decision, simulatedOutcome);
    if (simulatedOutcome.actionTaken) recordUsefulAction();
    else if (simulatedOutcome.tokensUsed > 0) recordRedundant();
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

  const receipt = {
    decision,
    outcome: {
      executed, actionTaken: simulatedOutcome.actionTaken || false,
      recipientKnew: simulatedOutcome.recipientKnew || false,
      tokensUsed: simulatedOutcome.tokensUsed || 0,
      channel: decision.encoding, recipientCount: outcome.recipientCount
    },
    agency: { autonomous: agency.autonomous, reason: agency.reason },
    shadow: shadowReceipt,
    utility: (decision.meta && decision.meta.utility) || 0,
    cost: (decision.meta && decision.meta.cost) || 0
  };

  return { decision, outcome, agency, receipt };
}

/**
 * Run cycles for multiple intents sequentially.
 */
async function runCycleBatch(cycles, globalOpts = {}) {
  const results = [];
  for (const c of cycles) {
    const result = await runCycle({ db: globalOpts.db, intent: c.intent, opts: c.opts || {} });
    results.push(result);
  }
  return results;
}

module.exports = { runCycle, runCycleBatch, simulateExecution };
