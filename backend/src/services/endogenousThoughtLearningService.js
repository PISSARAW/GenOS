'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const contracts = require('./versionedContractService');
const verificationContract = require('./endogenousThoughtVerificationContractService');
const learningContract = require('./endogenousThoughtLearningContractService');
const thoughtStore = require('./endogenousThoughtStoreService');
const { consumeAuthorization } = require('./shev/authorityService');
const verificationMigration = require('../db/migrations/migrateEndogenousThoughtVerifications');
const learningMigration = require('../db/migrations/migrateEndogenousThoughtLearnings');

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
    throw coded('ENDOGENOUS_LEARNING_TIME_INVALID', 'Learning time must be a positive epoch value.');
  }
  return { organizationId: required(input?.organizationId, 'ENDOGENOUS_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'ENDOGENOUS_PROJECT_REQUIRED'),
    episodeId: required(input?.episodeId, 'ENDOGENOUS_EPISODE_REQUIRED'),
    policyId: required(input?.policy?.id, 'ENDOGENOUS_LEARNING_POLICY_REQUIRED'),
    authorization: input.authorization, nowMs };
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

function verificationMatches(row, receipt) {
  const payload = receipt.payload;
  return payload.verificationId === row.verification_id
    && payload.episodeId === row.episode_id && payload.runId === row.run_id
    && payload.verdict === row.verdict && receipt.receiptId === row.receipt_id;
}

async function loadVerification(db, input) {
  const row = await db.get(`SELECT * FROM endogenous_thought_verifications
    WHERE organization_id=? AND project_id=? AND episode_id=?`,
  input.organizationId, input.projectId, input.episodeId);
  if (!row) {
    throw coded('ENDOGENOUS_LEARNING_VERIFICATION_NOT_FOUND',
      'An independent verification is required before learning.');
  }
  const receipt = parseReceipt(row, verificationContract,
    'ENDOGENOUS_LEARNING_VERIFICATION_INTEGRITY_FAILED');
  if (!verificationMatches(row, receipt)) {
    throw coded('ENDOGENOUS_LEARNING_VERIFICATION_INTEGRITY_FAILED',
      'Verification row does not match its receipt.');
  }
  return { row, receipt };
}

async function loadQuestion(db, input, questionRef) {
  const row = await db.get(`SELECT * FROM endogenous_thought_questions
    WHERE organization_id=? AND project_id=? AND receipt_id=?`,
  input.organizationId, input.projectId, questionRef);
  if (!row || row.episode_id !== input.episodeId) {
    throw coded('ENDOGENOUS_LEARNING_QUESTION_NOT_FOUND',
      'Verified question is not attached to this episode.');
  }
  const receipt = parseReceipt(row, contracts, 'ENDOGENOUS_LEARNING_QUESTION_INTEGRITY_FAILED');
  if (receipt.contractType !== 'EndogenousQuestion') {
    throw coded('ENDOGENOUS_LEARNING_QUESTION_INTEGRITY_FAILED',
      'Question contract type is invalid.');
  }
  return receipt;
}

function verifiedVersion(receipts) {
  const entry = receipts.find((item) => item.receipt.payload.toState === 'VERIFIED');
  if (!entry) throw coded('ENDOGENOUS_LEARNING_STATE_CONFLICT', 'Episode has no verified transition.');
  return entry.sequence + 1;
}

function expectedAuthorization(input, context) {
  const payload = context.verification.receipt.payload;
  return { operation: 'ett-learn', projectId: input.projectId,
    subjectId: payload.verificationId, expectedVersion: context.version,
    details: { episodeId: input.episodeId,
      verificationRef: context.verification.receipt.receiptId,
      verdict: payload.verdict, policyId: input.policyId,
      target: 'ett-episode-belief' },
    nonce: input.authorization?.nonce, expiresAt: input.authorization?.expiresAt,
    signature: input.authorization?.signature };
}

function assertAuthorization(input, expected) {
  const supplied = input.authorization;
  const valid = supplied && supplied.operation === expected.operation
    && supplied.projectId === expected.projectId && supplied.subjectId === expected.subjectId
    && supplied.expectedVersion === expected.expectedVersion
    && canonicalJson(supplied.details) === canonicalJson(expected.details);
  if (!valid) {
    throw coded('ENDOGENOUS_LEARNING_AUTHORIZATION_INVALID',
      'Learning authorization scope is invalid.');
  }
  return expected;
}

function buildPayload(context) {
  const verification = context.verification.receipt;
  const verified = verification.payload;
  const learnedAt = new Date(context.input.nowMs).toISOString();
  const basis = { projectId: context.input.projectId, episodeId: context.input.episodeId,
    verificationId: verified.verificationId, policyId: context.input.policyId };
  return { learningId: learningContract.learningIdFor(basis),
    episodeId: context.input.episodeId, projectId: context.input.projectId,
    agentId: context.episode.agentId, runId: verified.runId,
    verificationId: verified.verificationId, verificationRef: verification.receiptId,
    questionRef: context.question.receiptId, policyId: context.input.policyId,
    authorizationRef: `shev-authorization:${context.authorization.nonce}`,
    verdict: verified.verdict, revision: learningContract.revisionFor(verified.verdict),
    evidenceRefs: [...new Set([verification.receiptId, context.question.receiptId,
      ...verified.evidenceRefs])], boundaries: learningContract.BOUNDARIES, learnedAt };
}

function assertTiming(payload, verification, authorization) {
  const learnedAt = Date.parse(payload.learnedAt);
  const verifiedAt = Date.parse(verification.receipt.payload.verifiedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  if (Number.isNaN(learnedAt) || learnedAt < verifiedAt || learnedAt > expiresAt) {
    throw coded('ENDOGENOUS_LEARNING_TIMING_INVALID',
      'Learning must follow verification and precede authorization expiry.');
  }
}

function learningIdentity(payload, authorization) {
  return { learningId: payload.learningId, requestHash: digest({ payload, authorization }) };
}

function learningRowMatches(row, receipt) {
  const payload = receipt.payload;
  return payload.learningId === row.learning_id && payload.episodeId === row.episode_id
    && payload.verificationId === row.verification_id && payload.agentId === row.agent_id
    && payload.verdict === row.verdict && payload.revision.operation === row.revision_operation
    && Number(payload.revision.applied) === row.revision_applied
    && payload.authorizationRef === row.authorization_ref
    && receipt.receiptId === row.receipt_id && payload.learnedAt === row.learned_at;
}

function readLearning(row, requestHash) {
  if (!row) return null;
  if (row.request_hash !== requestHash) {
    throw coded('ENDOGENOUS_LEARNING_IDEMPOTENCY_CONFLICT',
      'Episode is bound to another learning request.');
  }
  const receipt = parseReceipt(row, learningContract, 'ENDOGENOUS_LEARNING_INTEGRITY_FAILED');
  if (!learningRowMatches(row, receipt)) {
    throw coded('ENDOGENOUS_LEARNING_INTEGRITY_FAILED',
      'Learning row does not match its receipt.');
  }
  return { receipt, replayed: true };
}

async function storedLearning(db, input, identity) {
  const row = await db.get(`SELECT * FROM endogenous_thought_learnings
    WHERE organization_id=? AND project_id=? AND episode_id=?`,
  input.organizationId, input.projectId, input.episodeId);
  return readLearning(row, identity.requestHash);
}

async function assertVerifiedRuntime(db, payload) {
  const task = await db.get('SELECT * FROM ontogenesis_backlog WHERE id=?', payload.taskId);
  const run = await db.get('SELECT * FROM ontogenesis_runs WHERE id=?', payload.runId);
  const valid = task?.project_id === payload.projectId && task.status === 'done'
    && run?.project_id === payload.projectId && run.task_id === payload.taskId
    && run.status === 'verified';
  if (!valid) {
    throw coded('ENDOGENOUS_LEARNING_RUNTIME_INTEGRITY_FAILED',
      'Only a completed verified runtime may be learned.');
  }
}

async function insertLearning(db, context) {
  const payload = context.receipt.payload;
  await db.run(`INSERT INTO endogenous_thought_learnings
    (organization_id,project_id,learning_id,episode_id,verification_id,agent_id,
     verdict,revision_operation,revision_applied,policy_id,authorization_ref,
     request_hash,receipt_id,content_hash,receipt_json,learned_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, context.input.organizationId,
  context.input.projectId, payload.learningId, payload.episodeId, payload.verificationId,
  payload.agentId, payload.verdict, payload.revision.operation, Number(payload.revision.applied),
  payload.policyId, payload.authorizationRef, context.identity.requestHash,
  context.receipt.receiptId, digest(context.receipt), canonicalJson(context.receipt),
  payload.learnedAt);
}

async function persistLearning(db, context) {
  const receipt = learningContract.createReceipt(context.payload);
  return withTransaction(db, async () => {
    const replay = await storedLearning(db, context.input, context.identity);
    if (replay) return replay;
    await consumeAuthorization(db, context.authorization);
    await insertLearning(db, { ...context, receipt });
    return storedLearning(db, context.input, context.identity);
  });
}

function transitionPayload(context) {
  const payload = context.learning.receipt.payload;
  const head = context.head.receipt.payload;
  return { transitionId: scopedId('ett_transition_learn', payload.learningId),
    episodeId: context.input.episodeId, agentId: context.episode.agentId,
    projectId: context.input.projectId, mandateRef: context.episode.mandateRef,
    fromState: 'VERIFIED', toState: 'LEARNED', triggerRef: context.episode.triggerRef,
    questionRef: head.questionRef, decisionRef: head.decisionRef,
    taskRef: head.taskRef, jobRef: payload.runId, budget: context.episode.budget,
    evidenceRefs: [...new Set([...head.evidenceRefs, context.learning.receipt.receiptId])],
    stopReason: null, occurredAt: payload.learnedAt,
    previousReceiptId: context.episode.currentReceiptId };
}

async function advanceEpisode(db, context) {
  const payload = context.learning.receipt.payload;
  if (context.episode.currentState === 'LEARNED') {
    const valid = context.head.receipt.payload.jobRef === payload.runId
      && context.head.receipt.payload.evidenceRefs.includes(context.learning.receipt.receiptId);
    if (!valid) throw coded('ENDOGENOUS_LEARNING_STATE_CONFLICT', 'Learned episode has another lineage.');
    return { receipt: context.head.receipt, replayed: true, sequence: context.head.sequence };
  }
  if (context.episode.currentState !== 'VERIFIED') {
    throw coded('ENDOGENOUS_LEARNING_STATE_CONFLICT', 'Episode is not ready for learning.');
  }
  return thoughtStore.transitionEpisode(db, { organizationId: context.input.organizationId,
    projectId: context.input.projectId, payload: transitionPayload(context) });
}

async function learnVerifiedThought(db, rawInput) {
  if (rawInput?.policy?.enabled !== true) return { status: 'skipped', reason: 'disabled' };
  const input = normalizeInput(rawInput);
  await thoughtStore.ensure(db);
  await verificationMigration.migrateEndogenousThoughtVerifications(db);
  await learningMigration.migrateEndogenousThoughtLearnings(db);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const head = receipts.at(-1);
  const verification = await loadVerification(db, input);
  await assertVerifiedRuntime(db, verification.receipt.payload);
  const question = await loadQuestion(db, input, head.receipt.payload.questionRef);
  const authorization = assertAuthorization(input, expectedAuthorization(input,
    { verification, version: verifiedVersion(receipts) }));
  const payload = buildPayload({ input, episode, verification, question, authorization });
  assertTiming(payload, verification, authorization);
  const identity = learningIdentity(payload, authorization);
  let learning = await storedLearning(db, input, identity);
  if (!learning) {
    if (episode.currentState !== 'VERIFIED') {
      throw coded('ENDOGENOUS_LEARNING_STATE_CONFLICT', 'Episode is not ready for learning.');
    }
    learning = await persistLearning(db, { input, payload, authorization, identity });
    learning.replayed = false;
  }
  const advanced = await advanceEpisode(db, { input, episode, head, learning });
  return { status: payload.revision.operation, learning, episode: advanced };
}

module.exports = { buildPayload, learnVerifiedThought, normalizeInput };
