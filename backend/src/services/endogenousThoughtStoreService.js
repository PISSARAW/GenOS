'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const contracts = require('./versionedContractService');
const migration = require('../db/migrations/migrateEndogenousThoughtEpisodes');

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty scoped identifier is required.');
  return value;
}

function scope(input) {
  const organizationId = required(input?.organizationId, 'ENDOGENOUS_ORGANIZATION_REQUIRED');
  const projectId = required(input?.projectId, 'ENDOGENOUS_PROJECT_REQUIRED');
  if (input.payload?.projectId && input.payload.projectId !== projectId) {
    throw coded('ENDOGENOUS_PROJECT_SCOPE_MISMATCH', 'Payload project does not match the storage scope.');
  }
  return { organizationId, projectId };
}

function hash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function sealedReceipt(type, payload) {
  const receipt = contracts.createReceipt(type, payload, {
    issuedAt: payload.occurredAt || payload.createdAt,
    sourceRefs: payload.evidenceRefs || payload.sourceRefs
  });
  return { receipt, contentHash: hash(receipt) };
}

function parseReceipt(row, expectedType) {
  const receipt = JSON.parse(row.receipt_json);
  const valid = contracts.readReceipt(receipt);
  if (row.content_hash !== hash(receipt) || !valid.valid || receipt.contractType !== expectedType) {
    throw coded('ENDOGENOUS_RECEIPT_INTEGRITY_FAILED', 'Stored receipt integrity validation failed.');
  }
  return receipt;
}

async function ensure(db) {
  await migration.migrateEndogenousThoughtEpisodes(db);
}

async function episodeRow(db, input, tenant = scope(input)) {
  return db.get(`SELECT * FROM endogenous_thought_episodes
    WHERE organization_id=? AND project_id=? AND episode_id=?`,
  tenant.organizationId, tenant.projectId, input.episodeId || input.payload?.episodeId);
}

async function transitionReplay(db, context) {
  const { input, tenant, sealed } = context;
  const row = await db.get(`SELECT * FROM endogenous_thought_receipts
    WHERE organization_id=? AND project_id=? AND transition_id=?`,
  tenant.organizationId, tenant.projectId, input.payload.transitionId);
  if (!row) return null;
  if (row.episode_id !== input.payload.episodeId || row.content_hash !== sealed.contentHash) {
    throw coded('ENDOGENOUS_TRANSITION_IDEMPOTENCY_CONFLICT',
      'Transition identifier is already bound to different content.');
  }
  return { receipt: parseReceipt(row, 'EndogenousThoughtEpisode'), replayed: true,
    sequence: row.sequence };
}

function assertEpisodeIdentity(row, payload) {
  const same = row.agent_id === payload.agentId && row.mandate_ref === payload.mandateRef
    && row.trigger_ref === payload.triggerRef && row.budget_json === canonicalJson(payload.budget);
  if (!same) throw coded('ENDOGENOUS_EPISODE_IDENTITY_CONFLICT', 'Episode identity or budget changed.');
}

async function assertQuestionReference(db, input, tenant) {
  if (input.payload.toState !== 'QUESTIONED') return;
  const row = await db.get(`SELECT * FROM endogenous_thought_questions
    WHERE organization_id=? AND project_id=? AND receipt_id=?`,
  tenant.organizationId, tenant.projectId, input.payload.questionRef);
  if (!row || row.episode_id !== input.payload.episodeId) {
    throw coded('ENDOGENOUS_QUESTION_NOT_FOUND', 'Question receipt is not attached to this episode.');
  }
  parseReceipt(row, 'EndogenousQuestion');
}

async function verifyHeadReceipt(db, row, tenant) {
  const receipt = await db.get(`SELECT * FROM endogenous_thought_receipts
    WHERE organization_id=? AND project_id=? AND receipt_id=?`,
  tenant.organizationId, tenant.projectId, row.current_receipt_id);
  if (!receipt || receipt.episode_id !== row.episode_id || receipt.sequence !== row.version - 1) {
    throw coded('ENDOGENOUS_LINEAGE_INTEGRITY_FAILED', 'Episode head does not match its receipt lineage.');
  }
  parseReceipt(receipt, 'EndogenousThoughtEpisode');
}

async function insertReceipt(db, input) {
  const { tenant, payload, sealed, sequence } = input;
  await db.run(`INSERT INTO endogenous_thought_receipts
    (organization_id,project_id,receipt_id,episode_id,transition_id,sequence,
      previous_receipt_id,from_state,to_state,content_hash,receipt_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, tenant.organizationId, tenant.projectId,
  sealed.receipt.receiptId, payload.episodeId, payload.transitionId, sequence,
  payload.previousReceiptId, payload.fromState, payload.toState, sealed.contentHash,
  canonicalJson(sealed.receipt));
}

async function createEpisode(db, context) {
  const { input, tenant, sealed } = context;
  if (input.payload.fromState !== null || input.payload.toState !== 'DETECTED') {
    throw coded('ENDOGENOUS_EPISODE_NOT_FOUND', 'Episode must begin with a DETECTED transition.');
  }
  await db.run(`INSERT INTO endogenous_thought_episodes
    (organization_id,project_id,episode_id,agent_id,mandate_ref,trigger_ref,budget_json,
      current_state,current_receipt_id,version) VALUES (?,?,?,?,?,?,?,?,?,1)`,
  tenant.organizationId, tenant.projectId, input.payload.episodeId, input.payload.agentId,
  input.payload.mandateRef, input.payload.triggerRef, canonicalJson(input.payload.budget),
  input.payload.toState, sealed.receipt.receiptId);
  await insertReceipt(db, { tenant, payload: input.payload, sealed, sequence: 0 });
  return { receipt: sealed.receipt, replayed: false, sequence: 0 };
}

function assertHead(row, payload) {
  if (row.current_state !== payload.fromState) {
    throw coded('ENDOGENOUS_STATE_CONFLICT', 'Transition does not start from the persisted state.');
  }
  if (row.current_receipt_id !== payload.previousReceiptId) {
    throw coded('ENDOGENOUS_LINEAGE_CONFLICT', 'Transition does not extend the persisted receipt lineage.');
  }
}

async function advanceEpisode(db, context) {
  const { input, tenant, sealed, row } = context;
  assertEpisodeIdentity(row, input.payload);
  assertHead(row, input.payload);
  await verifyHeadReceipt(db, row, tenant);
  await assertQuestionReference(db, input, tenant);
  await insertReceipt(db, { tenant, payload: input.payload, sealed, sequence: row.version });
  const updated = await db.run(`UPDATE endogenous_thought_episodes SET
    current_state=?,current_receipt_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP
    WHERE organization_id=? AND project_id=? AND episode_id=? AND version=?
      AND current_state=? AND current_receipt_id=?`, input.payload.toState,
  sealed.receipt.receiptId, tenant.organizationId, tenant.projectId,
  input.payload.episodeId, row.version, row.current_state, row.current_receipt_id);
  if (updated.changes !== 1) throw coded('ENDOGENOUS_STATE_CONFLICT', 'Episode head changed concurrently.');
  return { receipt: sealed.receipt, replayed: false, sequence: row.version };
}

async function transitionEpisode(db, input) {
  const tenant = scope(input);
  const sealed = sealedReceipt('EndogenousThoughtEpisode', input.payload);
  await ensure(db);
  return withTransaction(db, async () => {
    const context = { input, tenant, sealed };
    const replay = await transitionReplay(db, context);
    if (replay) return replay;
    const row = await episodeRow(db, input, tenant);
    if (!row) return createEpisode(db, context);
    return advanceEpisode(db, { ...context, row });
  });
}

async function startEpisode(db, input) {
  if (input?.payload?.fromState !== null || input?.payload?.toState !== 'DETECTED') {
    throw coded('ENDOGENOUS_INITIAL_TRANSITION_REQUIRED', 'Episode start requires START to DETECTED.');
  }
  return transitionEpisode(db, input);
}

async function questionReplay(db, context) {
  const { input, tenant, sealed } = context;
  const row = await db.get(`SELECT * FROM endogenous_thought_questions
    WHERE organization_id=? AND project_id=? AND question_id=?`,
  tenant.organizationId, tenant.projectId, input.payload.questionId);
  if (!row) return null;
  if (row.episode_id !== input.payload.episodeId || row.content_hash !== sealed.contentHash) {
    throw coded('ENDOGENOUS_QUESTION_IDEMPOTENCY_CONFLICT',
      'Question identifier is already bound to different content.');
  }
  return { receipt: parseReceipt(row, 'EndogenousQuestion'), replayed: true };
}

async function persistQuestion(db, input) {
  const tenant = scope(input);
  const sealed = sealedReceipt('EndogenousQuestion', input.payload);
  await ensure(db);
  return withTransaction(db, async () => {
    const replay = await questionReplay(db, { input, tenant, sealed });
    if (replay) return replay;
    const episode = await episodeRow(db, input, tenant);
    if (!episode) throw coded('ENDOGENOUS_EPISODE_NOT_FOUND', 'Question episode was not found.');
    if (!['DETECTED', 'FOLLOW_UP'].includes(episode.current_state)) {
      throw coded('ENDOGENOUS_QUESTION_STATE_CONFLICT', 'Episode is not ready for a new question.');
    }
    await db.run(`INSERT INTO endogenous_thought_questions
      (organization_id,project_id,question_id,episode_id,receipt_id,content_hash,receipt_json)
      VALUES (?,?,?,?,?,?,?)`, tenant.organizationId, tenant.projectId, input.payload.questionId,
    input.payload.episodeId, sealed.receipt.receiptId, sealed.contentHash,
    canonicalJson(sealed.receipt));
    return { receipt: sealed.receipt, replayed: false };
  });
}

async function getEpisode(db, input) {
  const tenant = scope(input);
  await ensure(db);
  const row = await episodeRow(db, input, tenant);
  if (!row) throw coded('ENDOGENOUS_EPISODE_NOT_FOUND', 'Scoped episode was not found.');
  await verifyHeadReceipt(db, row, tenant);
  return { episodeId: row.episode_id, agentId: row.agent_id, projectId: row.project_id,
    mandateRef: row.mandate_ref, triggerRef: row.trigger_ref,
    budget: JSON.parse(row.budget_json), currentState: row.current_state,
    currentReceiptId: row.current_receipt_id, version: row.version };
}

async function listReceipts(db, input) {
  const tenant = scope(input);
  await ensure(db);
  const rows = await db.all(`SELECT * FROM endogenous_thought_receipts
    WHERE organization_id=? AND project_id=? AND episode_id=? ORDER BY sequence`,
  tenant.organizationId, tenant.projectId, required(input.episodeId, 'ENDOGENOUS_EPISODE_REQUIRED'));
  if (!rows.length) throw coded('ENDOGENOUS_EPISODE_NOT_FOUND', 'Scoped episode was not found.');
  return rows.map((row) => ({ sequence: row.sequence,
    receipt: parseReceipt(row, 'EndogenousThoughtEpisode') }));
}

module.exports = { ensure, startEpisode, persistQuestion, transitionEpisode, getEpisode, listReceipts };
