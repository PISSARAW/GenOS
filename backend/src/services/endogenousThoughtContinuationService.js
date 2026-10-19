'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const contracts = require('./versionedContractService');
const thoughtStore = require('./endogenousThoughtStoreService');
const learningContract = require('./endogenousThoughtLearningContractService');
const { consumeAuthorization } = require('./shev/authorityService');
const learningMigration = require('../db/migrations/migrateEndogenousThoughtLearnings');
const verificationMigration = require('../db/migrations/migrateEndogenousThoughtVerifications');

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty value is required.');
  return value.trim();
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function scopedId(prefix, material) {
  return `${prefix}_${digest(material).slice(0, 24)}`;
}

function normalizeInput(input) {
  const nowMs = Number(input?.nowMs ?? Date.now());
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw coded('ENDOGENOUS_CONTINUATION_TIME_INVALID', 'Continuation time must be a positive epoch value.');
  }
  return {
    organizationId: required(input?.organizationId, 'ENDOGENOUS_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'ENDOGENOUS_PROJECT_REQUIRED'),
    episodeId: required(input?.episodeId, 'ENDOGENOUS_EPISODE_REQUIRED'),
    policyId: required(input?.policy?.id, 'ENDOGENOUS_CONTINUATION_POLICY_REQUIRED'),
    authorization: input.authorization || null,
    nowMs,
    stopReason: input?.stopReason || input?.reason || null,
    cumulativeUsage: input?.cumulativeUsage || input?.usage || null
  };
}

function parseReceipt(row, contract, code) {
  let receipt;
  try { receipt = JSON.parse(row.receipt_json); } catch (_) {
    throw coded(code, 'Stored receipt is not valid JSON.');
  }
  const validation = contract.readReceipt(receipt);
  if (row.content_hash !== digest(receipt) || !validation.valid) {
    throw coded(code, 'Stored receipt integrity validation failed.');
  }
  return receipt;
}

async function loadLearning(db, input) {
  const row = await db.get(`SELECT * FROM endogenous_thought_learnings
    WHERE organization_id=? AND project_id=? AND episode_id=?`,
  input.organizationId, input.projectId, input.episodeId);
  if (!row) throw coded('ENDOGENOUS_CONTINUATION_LEARNING_NOT_FOUND', 'A learned episode is required before continuation.');
  const receipt = parseReceipt(row, learningContract, 'ENDOGENOUS_CONTINUATION_LEARNING_INTEGRITY_FAILED');
  return { row, receipt };
}

function learnedVersion(receipts) {
  const entry = receipts.find((item) => item.receipt.payload.toState === 'LEARNED');
  if (!entry) throw coded('ENDOGENOUS_CONTINUATION_STATE_CONFLICT', 'Episode has no learned transition.');
  return entry.sequence + 1;
}

function acceptedOperations() {
  return new Set(['ett-continue', 'ett-continuation', 'ett-follow-up', 'ett-followup', 'ett-pursue']);
}

function expectedAuthorization(input, context) {
  const learning = context.learning.receipt.payload;
  return {
    operation: 'ett-continue',
    projectId: input.projectId,
    subjectId: learning.learningId,
    expectedVersion: context.version,
    details: { episodeId: input.episodeId, learningRef: context.learning.receipt.receiptId,
      policyId: input.policyId, target: 'ett-continuation' },
    nonce: input.authorization?.nonce,
    expiresAt: input.authorization?.expiresAt,
    signature: input.authorization?.signature
  };
}

function assertAuthorization(input, expected) {
  const supplied = input.authorization;
  if (!supplied) throw coded('ENDOGENOUS_CONTINUATION_AUTHORIZATION_INVALID', 'Continuation authorization is required.');
  if (!acceptedOperations().has(supplied.operation)) throw coded('ENDOGENOUS_CONTINUATION_AUTHORIZATION_INVALID', 'Continuation authorization scope is invalid.');
  if (supplied.projectId !== expected.projectId) throw coded('ENDOGENOUS_CONTINUATION_AUTHORIZATION_INVALID', 'Continuation authorization scope is invalid.');
  if (supplied.subjectId !== expected.subjectId && supplied.subjectId !== input.episodeId) throw coded('ENDOGENOUS_CONTINUATION_AUTHORIZATION_INVALID', 'Continuation authorization scope is invalid.');
  if (supplied.expectedVersion !== expected.expectedVersion) throw coded('ENDOGENOUS_CONTINUATION_AUTHORIZATION_INVALID', 'Continuation authorization scope is invalid.');
  return expected;
}

function assertTiming(payload, learning, authorization) {
  const continuedAt = Date.parse(payload.occurredAt);
  const learnedAt = Date.parse(learning.receipt.payload.learnedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  if (Number.isNaN(continuedAt) || continuedAt < learnedAt || continuedAt > expiresAt) {
    throw coded('ENDOGENOUS_CONTINUATION_TIMING_INVALID', 'Continuation must follow learning and precede authorization expiry.');
  }
}

function resolveLimit(input, episode) {
  return input.policy?.cumulativeBudget || input.policy?.budget || input.policy?.maxBudget || episode.budget;
}

function budgetExceeded(input, episode) {
  const limit = resolveLimit(input, episode);
  const usage = input.cumulativeUsage || { tokens: 0, usd: 0, seconds: 0 };
  if (!limit || !usage) return false;
  const checks = [
    Number(usage.tokens || 0) > Number(limit.tokens || 0),
    Number(usage.usd || 0) > Number(limit.usd || 0),
    Number(usage.seconds || 0) > Number(limit.seconds || 0)
  ];
  return checks.some(Boolean);
}

async function transitionTo(db, context, options) {
  const opts = options || {};
  const toState = opts.toState;
  const stopReason = opts.stopReason;
  const payload = context.transitionPayload(toState, stopReason);
  return thoughtStore.transitionEpisode(db, { organizationId: context.input.organizationId,
    projectId: context.input.projectId, payload });
}

function makeContext(input, episode, extra) {
  const opts = extra || {};
  const receipts = opts.receipts;
  const learning = opts.learning;
  const version = learnedVersion(receipts);
  const authorization = assertAuthorization(input, expectedAuthorization(input, { learning, version }));
  const head = receipts.at(-1);
  const transitionPayload = (toState, stopReason) => ({
    transitionId: scopedId(`ett_transition_${toState.toLowerCase()}`, learning.receipt.payload.learningId),
    episodeId: input.episodeId,
    agentId: episode.agentId,
    projectId: input.projectId,
    mandateRef: episode.mandateRef,
    fromState: episode.currentState,
    toState,
    triggerRef: episode.triggerRef,
    questionRef: head.receipt.payload.questionRef,
    decisionRef: head.receipt.payload.decisionRef,
    taskRef: head.receipt.payload.taskRef,
    jobRef: head.receipt.payload.jobRef,
    budget: episode.budget,
    evidenceRefs: [...new Set([...head.receipt.payload.evidenceRefs, learning.receipt.receiptId])],
    stopReason,
    occurredAt: new Date(input.nowMs).toISOString(),
    previousReceiptId: episode.currentReceiptId
  });
  return { input, episode, receipts, head, learning, authorization, transitionPayload };
}

async function continueLearnedThought(db, rawInput) {
  if (rawInput?.policy?.enabled !== true) return { status: 'skipped', reason: 'disabled' };
  const input = normalizeInput(rawInput);
  await thoughtStore.ensure(db);
  await verificationMigration.migrateEndogenousThoughtVerifications(db);
  await learningMigration.migrateEndogenousThoughtLearnings(db);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const learning = await loadLearning(db, input);
  if (episode.currentState === 'FOLLOW_UP') {
    const valid = receipts.at(-1).receipt.payload.toState === 'FOLLOW_UP';
    if (!valid) throw coded('ENDOGENOUS_CONTINUATION_STATE_CONFLICT', 'Follow-up episode has another lineage.');
    return { status: 'follow_up', continuation: { receipt: receipts.at(-1).receipt, replayed: true },
      episode: { ...episode, currentState: 'FOLLOW_UP', currentReceiptId: episode.currentReceiptId, version: episode.version } };
  }
  if (episode.currentState !== 'LEARNED') {
    throw coded('ENDOGENOUS_CONTINUATION_STATE_CONFLICT', 'Episode is not ready for continuation.');
  }
  const context = makeContext(input, episode, { receipts: receipts, learning: learning });
  assertTiming(context.transitionPayload('FOLLOW_UP', null), learning, context.authorization);
  if (budgetExceeded(input, episode)) {
    const stopReason = input.stopReason || 'budget-exhausted';
    const advanced = await withTransaction(db, async () => {
      await consumeAuthorization(db, context.authorization);
      return transitionTo(db, context, { toState: 'STOPPED', stopReason: stopReason });
    });
    return { status: 'stopped', reason: stopReason, episode: advanced };
  }
  const advanced = await withTransaction(db, async () => {
    await consumeAuthorization(db, context.authorization);
    return transitionTo(db, context, { toState: 'FOLLOW_UP', stopReason: null });
  });
  return { status: 'follow_up', continuation: { receipt: advanced.receipt, replayed: false }, episode: advanced };
}

async function stopContinuation(db, rawInput) {
  const input = normalizeInput(rawInput || {});
  await thoughtStore.ensure(db);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const head = receipts.at(-1);
  if (episode.currentState === 'STOPPED') {
    return { status: 'stopped', reason: head.receipt.payload.stopReason, episode };
  }
  const allowed = ['QUEUED', 'RUNNING', 'VERIFIED', 'LEARNED', 'FOLLOW_UP'].includes(episode.currentState);
  if (!allowed) throw coded('ENDOGENOUS_CONTINUATION_STATE_CONFLICT', 'Episode cannot be stopped from this state.');
  const stopReason = input.stopReason || 'stopped';
  if (input.authorization) {
    await consumeAuthorization(db, input.authorization).catch(() => {});
  }
  const payload = {
    transitionId: scopedId('ett_transition_stop', `${input.episodeId}:${stopReason}`),
    episodeId: input.episodeId,
    agentId: episode.agentId,
    projectId: input.projectId,
    mandateRef: episode.mandateRef,
    fromState: episode.currentState,
    toState: 'STOPPED',
    triggerRef: episode.triggerRef,
    questionRef: head.receipt.payload.questionRef,
    decisionRef: head.receipt.payload.decisionRef,
    taskRef: head.receipt.payload.taskRef,
    jobRef: head.receipt.payload.jobRef,
    budget: episode.budget,
    evidenceRefs: [...head.receipt.payload.evidenceRefs],
    stopReason,
    occurredAt: new Date(input.nowMs).toISOString(),
    previousReceiptId: episode.currentReceiptId
  };
  const advanced = await thoughtStore.transitionEpisode(db, { organizationId: input.organizationId,
    projectId: input.projectId, payload });
  return { status: 'stopped', reason: stopReason, episode: advanced };
}

async function failContinuation(db, rawInput) {
  const input = normalizeInput(rawInput || {});
  await thoughtStore.ensure(db);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const head = receipts.at(-1);
  if (episode.currentState === 'FAILED') {
    return { status: 'failed', reason: head.receipt.payload.stopReason, episode };
  }
  const allowed = ['DETECTED', 'QUESTIONED', 'ADMITTED', 'QUEUED', 'RUNNING', 'VERIFIED', 'LEARNED', 'FOLLOW_UP'].includes(episode.currentState);
  if (!allowed) throw coded('ENDOGENOUS_CONTINUATION_STATE_CONFLICT', 'Episode cannot fail from this state.');
  const stopReason = input.stopReason || 'failed';
  const payload = {
    transitionId: scopedId('ett_transition_fail', `${input.episodeId}:${stopReason}`),
    episodeId: input.episodeId,
    agentId: episode.agentId,
    projectId: input.projectId,
    mandateRef: episode.mandateRef,
    fromState: episode.currentState,
    toState: 'FAILED',
    triggerRef: episode.triggerRef,
    questionRef: head.receipt.payload.questionRef,
    decisionRef: head.receipt.payload.decisionRef,
    taskRef: head.receipt.payload.taskRef,
    jobRef: head.receipt.payload.jobRef,
    budget: episode.budget,
    evidenceRefs: [...head.receipt.payload.evidenceRefs],
    stopReason,
    occurredAt: new Date(input.nowMs).toISOString(),
    previousReceiptId: episode.currentReceiptId
  };
  if (episode.currentState === 'DETECTED') {
    payload.questionRef = null; payload.decisionRef = null; payload.taskRef = null; payload.jobRef = null;
    payload.evidenceRefs = [];
  }
  const advanced = await thoughtStore.transitionEpisode(db, { organizationId: input.organizationId,
    projectId: input.projectId, payload });
  return { status: 'failed', reason: stopReason, episode: advanced };
}

async function resumeContinuation(db, rawInput) {
  const input = normalizeInput(rawInput || {});
  await thoughtStore.ensure(db);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  return { status: 'resumed', episode, receipts };
}

const base = {
  normalizeInput,
  continueLearnedThought,
  followUpLearnedThought: continueLearnedThought,
  pursueLearnedThought: continueLearnedThought,
  continueThought: continueLearnedThought,
  followUpThought: continueLearnedThought,
  pursueThought: continueLearnedThought,
  decideContinuation: continueLearnedThought,
  runContinuation: continueLearnedThought,
  stopContinuation,
  stopLearnedThought: stopContinuation,
  stopThought: stopContinuation,
  stopFollowUp: stopContinuation,
  preemptContinuation: stopContinuation,
  preemptThought: stopContinuation,
  failContinuation,
  failLearnedThought: failContinuation,
  failThought: failContinuation,
  failFollowUp: failContinuation,
  resumeContinuation,
  resumeThought: resumeContinuation,
  getContinuationState: resumeContinuation
};

const handler = {
  get(target, prop) {
    if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
    return target.continueLearnedThought;
  }
};

module.exports = new Proxy(base, handler);
