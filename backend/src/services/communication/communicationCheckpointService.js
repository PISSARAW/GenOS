'use strict';

/**
 * CommunicationCheckpointService — X5 mandatory checkpoint evaluation.
 *
 * At each important checkpoint (new evidence, blocker, contradiction, capability
 * missing, finding, handoff, topology transition, mission completion), the policy
 * engine automatically evaluates whether communication is needed. SILENCE is a
 * valid optimal decision. The LLM does NOT decide whether to communicate.
 */

const { decideCommunication, getMode } = require('./communicationPolicyEngine');
const { buildManifest } = require('./communicationManifestService');
const { publishSignal } = require('../signalingTransportService');

const CHECKPOINTS = Object.freeze([
  'NEW_EVIDENCE',
  'BLOCKER_DETECTED',
  'CONTRADICTION_FOUND',
  'CAPABILITY_MISSING',
  'FINDING_CREATED',
  'HANDOFF_REQUESTED',
  'TOPOLOGY_TRANSITION',
  'MISSION_COMPLETED'
]);

const CHECKPOINT_SET = new Set(CHECKPOINTS);

const checkpointHistory = new Map();
const checkpointPolicies = new Map();

const PURPOSE_MAP = Object.freeze({
  BLOCKER_DETECTED: 'escalate',
  CONTRADICTION_FOUND: 'challenge',
  CAPABILITY_MISSING: 'request',
  HANDOFF_REQUESTED: 'handoff',
  TOPOLOGY_TRANSITION: 'coordinate',
  MISSION_COMPLETED: 'inform',
  FINDING_CREATED: 'inform',
  NEW_EVIDENCE: 'inform'
});

const RISK_MAP = Object.freeze({
  BLOCKER_DETECTED: 'high',
  CONTRADICTION_FOUND: 'medium',
  CAPABILITY_MISSING: 'medium',
  HANDOFF_REQUESTED: 'medium',
  TOPOLOGY_TRANSITION: 'low',
  MISSION_COMPLETED: 'low',
  FINDING_CREATED: 'low',
  NEW_EVIDENCE: 'low'
});

const URGENCY_MAP = Object.freeze({
  BLOCKER_DETECTED: 0.9,
  CONTRADICTION_FOUND: 0.7,
  CAPABILITY_MISSING: 0.6,
  HANDOFF_REQUESTED: 0.8,
  TOPOLOGY_TRANSITION: 0.5,
  MISSION_COMPLETED: 0.4,
  FINDING_CREATED: 0.5,
  NEW_EVIDENCE: 0.5
});

const ACTION_MAP = Object.freeze({
  BLOCKER_DETECTED: true,
  CONTRADICTION_FOUND: true,
  CAPABILITY_MISSING: true,
  HANDOFF_REQUESTED: true,
  TOPOLOGY_TRANSITION: false,
  MISSION_COMPLETED: false,
  FINDING_CREATED: false,
  NEW_EVIDENCE: false
});

function defaultPolicy() {
  return new Set(CHECKPOINTS);
}

function getPolicy(agentId) {
  return checkpointPolicies.get(agentId) || defaultPolicy();
}

function buildIntent(ctx) {
  const evidence = ctx.evidence || {};
  return {
    senderAgentId: ctx.agentId,
    purpose: PURPOSE_MAP[ctx.checkpoint] || 'inform',
    risk: RISK_MAP[ctx.checkpoint] || 'low',
    urgency: URGENCY_MAP[ctx.checkpoint] || 0.5,
    domain: evidence.domain || 'general',
    requiresAction: ACTION_MAP[ctx.checkpoint] || false,
    semanticRefs: evidence.semanticRefs || [],
    independenceRequired: false
  };
}

function buildPolicyInput(ctx, intent, manifest) {
  return {
    db: ctx.db,
    intent,
    trigger: ctx.checkpoint,
    receptorTopic: manifest.subscriptions[0] || '',
    allowGlobal: ctx.checkpoint === 'BLOCKER_DETECTED',
    maxCandidates: 10,
    independenceThreshold: 0.5,
    maxCost: 50,
    weights: { novelty: 1, relevance: 1, actionability: 1, capability: 1 },
    stigmergyAvailable: false,
    dialectAvailable: false,
    ttlMs: 60000,
    humanRequired: intent.risk === 'critical',
    coefficients: { baseCost: 0.1, perRecipient: 0.05, encodingFactor: 1, groundingFactor: 1 }
  };
}

function validateCtx(ctx) {
  if (!ctx || !ctx.agentId) throw new Error('agentId is required.');
  if (!ctx.checkpoint) throw new Error('checkpoint is required.');
  if (!CHECKPOINT_SET.has(ctx.checkpoint)) throw new Error(`Unknown checkpoint: ${ctx.checkpoint}`);
}

function shouldSkip(ctx, policy) {
  return !policy.has(ctx.checkpoint);
}

function buildReceipt(ctx, decision) {
  return {
    agentId: ctx.agentId,
    checkpoint: ctx.checkpoint,
    timestamp: new Date().toISOString(),
    decision: {
      action: decision.action,
      scope: decision.scope,
      encoding: decision.encoding,
      reasonCodes: decision.reasonCodes || []
    },
    meta: decision.meta || {},
    executed: null
  };
}

function storeReceipt(agentId, receipt) {
  if (!checkpointHistory.has(agentId)) checkpointHistory.set(agentId, []);
  const history = checkpointHistory.get(agentId);
  history.push(receipt);
  if (history.length > 100) history.splice(0, history.length - 100);
}

async function executeSignal(decision, ctx) {
  if (decision.action === 'SILENCE') {
    return { executed: false, reason: 'SILENCE_DECISION' };
  }
  if (decision.action === 'STIGMERGY') {
    return { executed: false, channel: 'STIGMERGY', reason: 'CHANNEL_EXECUTION_NOT_CONNECTED' };
  }
  if (decision.action !== 'SIGNAL') {
    return { executed: false, channel: decision.action, reason: 'CHANNEL_EXECUTION_NOT_CONNECTED' };
  }
  const recipients = decision.recipients || [];
  if (recipients.length === 0 && decision.scope !== 'GLOBAL_BROADCAST') {
    return { executed: false, reason: 'NO_RECIPIENTS' };
  }
  return await publishAndWrap(decision, ctx, recipients);
}

function buildSignalData(ctx, decision) {
  const artifactId = ctx.evidence ? ctx.evidence.artifactId : null;
  const utility = decision.meta ? decision.meta.utility : undefined;
  return {
    semanticType: ctx.checkpoint,
    concentration: 0.8,
    artifactRef: artifactId,
    content: {
      checkpoint: ctx.checkpoint,
      decision: decision.action,
      reasonCodes: decision.reasonCodes,
      utility
    }
  };
}

function buildExecutionResult(decision, result) {
  return {
    executed: Boolean(result && result.published),
    channel: decision.action,
    signalId: result && result.signalId || null,
    published: result && result.published || false
  };
}

async function publishAndWrap(decision, ctx, recipients) {
  const signalData = buildSignalData(ctx, decision);
  const topic = recipients.length > 0 ? 'checkpoint' : 'global';
  const params = {
    signalType: 'ligand',
    signalData,
    topic,
    senderAgentId: ctx.agentId,
    recipientAgentIds: recipients.length > 0 ? recipients : undefined,
    ttlMs: decision.ttlMs || 60000
  };
  const result = await publishSignal(params);
  return buildExecutionResult(decision, result);
}

async function evaluateCheckpoint(ctx) {
  validateCtx(ctx);
  const policy = getPolicy(ctx.agentId);
  if (shouldSkip(ctx, policy)) {
    return { agentId: ctx.agentId, checkpoint: ctx.checkpoint, skipped: true, reason: 'POLICY_DISABLED' };
  }
  const manifest = await buildManifest(ctx);
  const intent = buildIntent(ctx);
  const input = buildPolicyInput(ctx, intent, manifest);
  const decision = await decideCommunication(input);
  const receipt = buildReceipt(ctx, decision);
  receipt.executed = getMode() === 'shadow'
    ? { executed: false, reason: 'SHADOW_MODE' }
    : decision.action === 'SILENCE'
    ? { executed: false, reason: 'SILENCE_DECISION' }
    : await executeSignal(decision, ctx);
  storeReceipt(ctx.agentId, receipt);
  return receipt;
}

function getCheckpointHistory(agentId) {
  return (checkpointHistory.get(agentId) || []).slice();
}

function setCheckpointPolicy(ctx) {
  if (!ctx || !ctx.agentId) throw new Error('agentId is required.');
  if (!ctx.enabledCheckpoints || !Array.isArray(ctx.enabledCheckpoints)) {
    throw new Error('enabledCheckpoints array is required.');
  }
  const enabled = ctx.enabledCheckpoints.filter((cp) => CHECKPOINT_SET.has(cp));
  checkpointPolicies.set(ctx.agentId, new Set(enabled));
  return { agentId: ctx.agentId, enabledCheckpoints: enabled };
}

module.exports = {
  CHECKPOINTS,
  evaluateCheckpoint,
  getCheckpointHistory,
  setCheckpointPolicy
};
