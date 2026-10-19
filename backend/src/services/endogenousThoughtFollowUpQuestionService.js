'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const thoughtStore = require('./endogenousThoughtStoreService');
const questionGeneration = require('./endogenousThoughtQuestionGenerationService');

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

function scopedId(prefix, value) {
  return `${prefix}_${digest(value).slice(0, 24)}`;
}

function normalizeInput(input) {
  const nowMs = Number(input?.nowMs ?? Date.now());
  if (!Number.isFinite(nowMs) || nowMs < 0) throw coded('ENDOGENOUS_FOLLOW_UP_TIME_INVALID', 'Follow-up time is invalid.');
  return {
    organizationId: required(input?.organizationId, 'ENDOGENOUS_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'ENDOGENOUS_PROJECT_REQUIRED'),
    episodeId: required(input?.episodeId, 'ENDOGENOUS_EPISODE_REQUIRED'),
    nowMs,
    questionGenerator: typeof input?.questionGenerator === 'function' ? input.questionGenerator : null
  };
}

async function latestLearning(db, input) {
  const row = await db.get(`SELECT receipt_id,verdict FROM endogenous_thought_learnings
    WHERE organization_id=? AND project_id=? AND episode_id=?
    ORDER BY learned_at DESC LIMIT 1`, input.organizationId, input.projectId, input.episodeId);
  if (!row) throw coded('ENDOGENOUS_FOLLOW_UP_LEARNING_NOT_FOUND', 'Follow-up requires a learned result.');
  return row;
}

function generationInput(context) {
  const previous = context.previous.receipt.payload;
  return {
    summary: `Résultat ${context.learning.verdict} pour ${previous.text}`,
    dimension: { name: previous.domain, expected: previous.falsifier,
      acceptance: previous.expectedEvidence },
    previousQuestion: previous,
    db: context.db, agentId: context.episode.agentId,
    organizationId: context.input.organizationId, projectId: context.input.projectId,
    budget: context.episode.budget, questionGenerator: context.input.questionGenerator,
    refs: context.refs, payload: context.head.receipt.payload, context
  };
}

function questionPayload(context, generated) {
  const previous = context.previous.receipt.payload;
  return {
    questionId: scopedId('ett_question_follow_up', context.head.receipt.receiptId),
    episodeId: context.input.episodeId, domain: previous.domain,
    ...generated.question,
    expectedEvidence: [...new Set(previous.expectedEvidence)],
    expectedInformationGain: previous.expectedInformationGain,
    estimatedCost: context.episode.budget, risk: previous.risk,
    sourceRefs: context.refs, createdAt: new Date(context.input.nowMs).toISOString()
  };
}

function transitionPayload(context, question) {
  const head = context.head.receipt.payload;
  return {
    transitionId: scopedId('ett_transition_follow_up_question', question.receipt.receiptId),
    episodeId: context.input.episodeId, agentId: context.episode.agentId,
    projectId: context.input.projectId, mandateRef: context.episode.mandateRef,
    fromState: 'FOLLOW_UP', toState: 'QUESTIONED', triggerRef: context.episode.triggerRef,
    questionRef: question.receipt.receiptId, decisionRef: null, taskRef: null, jobRef: null,
    budget: context.episode.budget,
    evidenceRefs: [...new Set([...head.evidenceRefs, question.receipt.receiptId])],
    stopReason: null, occurredAt: new Date(context.input.nowMs).toISOString(),
    previousReceiptId: context.episode.currentReceiptId
  };
}

async function replayQuestion(db, { input, episode, head }) {
  const valid = episode.currentState === 'QUESTIONED' && head.receipt.payload.fromState === 'FOLLOW_UP';
  if (!valid) return null;
  const question = await thoughtStore.getQuestion(db, { ...input,
    receiptId: head.receipt.payload.questionRef });
  return { status: 'questioned', question, episode: head,
    questionGeneration: { status: 'replayed', source: 'stored' } };
}

async function questionFollowUp(db, rawInput) {
  const input = normalizeInput(rawInput);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const head = receipts.at(-1);
  const replay = await replayQuestion(db, { input, episode, head });
  if (replay) return replay;
  if (episode.currentState !== 'FOLLOW_UP') {
    throw coded('ENDOGENOUS_FOLLOW_UP_STATE_CONFLICT', 'Episode is not ready for a follow-up question.');
  }
  const previous = await thoughtStore.getQuestion(db, { ...input,
    receiptId: head.receipt.payload.questionRef });
  const learning = await latestLearning(db, input);
  const refs = [...new Set([...head.receipt.payload.evidenceRefs,
    previous.receipt.receiptId, learning.receipt_id])];
  const context = { db, input, episode, head, previous, learning, refs };
  const generated = await questionGeneration.generate(generationInput(context));
  const question = await thoughtStore.persistQuestion(db, { ...input,
    payload: questionPayload(context, generated) });
  const advanced = await thoughtStore.transitionEpisode(db, { ...input,
    payload: transitionPayload(context, question) });
  return { status: 'questioned', question, episode: advanced,
    questionGeneration: generated.generation };
}

module.exports = { questionFollowUp, normalizeInput };
