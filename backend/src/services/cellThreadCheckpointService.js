'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const threads = require('./cellThreadService');
const { migrateCellThreadCheckpoints } = require('../db/migrations/migrateCellThreadCheckpoints');

const MAX_CONTEXT_BYTES = 256 * 1024;
const MAX_EVIDENCE_REFS = 64;
const MAX_EVIDENCE_REF_BYTES = 1024;
const MAX_PROOF_CODE_BYTES = 1024;
const SENSITIVE_KEYS = new Set([
  'token', 'secret', 'password', 'credential', 'authorization', 'apikey'
]);
const RESUMABLE = new Set([
  'ready', 'waiting_signal', 'waiting_permission', 'budget_quiescent',
  'evidence_quiescent', 'quarantined'
]);

function failure(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function requiredScope(input) {
  const fields = ['organizationId', 'projectId', 'missionId', 'episodeId', 'threadId', 'workerId'];
  if (!input || fields.some((field) => !input[field])) {
    throw failure('CELL_CHECKPOINT_SCOPE_REQUIRED',
      'Organization, project, mission, episode, thread and worker are required.', 400);
  }
  return input;
}

function boundedContext(value) {
  if (containsSensitiveKey(value)) {
    throw failure('CELL_CHECKPOINT_CONTEXT_SENSITIVE',
      'Checkpoint context contains a sensitive key.', 400);
  }
  let json;
  try {
    json = canonicalJson(value ?? {});
  } catch (_) {
    throw failure('CELL_CHECKPOINT_CONTEXT_INVALID', 'Checkpoint context must be JSON.', 400);
  }
  if (typeof json !== 'string') {
    throw failure('CELL_CHECKPOINT_CONTEXT_INVALID', 'Checkpoint context must be JSON.', 400);
  }
  try {
    JSON.parse(json);
  } catch (_) {
    throw failure('CELL_CHECKPOINT_CONTEXT_INVALID', 'Checkpoint context must be JSON.', 400);
  }
  const size = Buffer.byteLength(json);
  if (size > MAX_CONTEXT_BYTES) {
    throw failure('CELL_CHECKPOINT_CONTEXT_TOO_LARGE', 'Checkpoint context exceeds 256 KiB.', 413);
  }
  return { json, size, hash: sha256(json) };
}

function containsSensitiveKey(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsSensitiveKey(item, seen));
  return Object.keys(value).some((key) => sensitiveKey(key)
    || containsSensitiveKey(value[key], seen));
}

function sensitiveKey(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEYS.has(normalized)
    || [...SENSITIVE_KEYS].some((name) => normalized.endsWith(name));
}

function boundedEvidence(refs) {
  if (!Array.isArray(refs) || refs.length > MAX_EVIDENCE_REFS) {
    throw failure('CELL_CHECKPOINT_EVIDENCE_INVALID',
      'Checkpoint evidence must contain at most 64 references.', 400);
  }
  const normalized = refs.map((ref) => String(ref));
  if (normalized.some((ref) => !ref || Buffer.byteLength(ref) > MAX_EVIDENCE_REF_BYTES)) {
    throw failure('CELL_CHECKPOINT_EVIDENCE_INVALID',
      'Checkpoint evidence references must be nonempty and at most 1024 bytes.', 400);
  }
  return [...new Set(normalized)].sort();
}

function checkpointMaterial(input) {
  return {
    missionId: input.missionId, episodeId: input.episodeId,
    threadId: input.threadId, workerId: input.workerId,
    organizationId: input.organizationId, projectId: input.projectId,
    threadRevision: input.threadRevision, threadState: input.threadState,
    contextHash: input.contextHash, contextSize: input.contextSize,
    evidenceRefs: input.evidenceRefs
  };
}

function checkpointId(input, hash) {
  if (input.checkpointId) {
    if (typeof input.checkpointId !== 'string' || input.checkpointId.length > 200) {
      throw failure('CELL_CHECKPOINT_ID_INVALID', 'Checkpoint id is invalid.', 400);
    }
    return input.checkpointId;
  }
  return `cell_checkpoint_${hash.slice('sha256:'.length, 'sha256:'.length + 32)}`;
}

function format(row) {
  if (!row) return null;
  return {
    checkpointId: row.checkpoint_id, missionId: row.mission_id,
    episodeId: row.episode_id, threadId: row.thread_id, workerId: row.worker_id,
    organizationId: row.organization_id, projectId: row.project_id,
    threadRevision: row.thread_revision, threadState: row.thread_state,
    context: JSON.parse(row.context_json), contextSize: row.context_size,
    contextHash: row.context_hash, evidenceRefs: JSON.parse(row.evidence_refs_json),
    checkpointHash: row.checkpoint_hash, createdAt: row.created_at
  };
}

function assertThreadIdentity(row, input) {
  const exact = row.mission_id === input.missionId && row.episode_id === input.episodeId
    && row.thread_id === input.threadId && row.worker_id === input.workerId
    && row.organization_id === input.organizationId && row.project_id === input.projectId;
  if (!exact) throw failure('CELL_CHECKPOINT_CELL_MISMATCH',
    'Checkpoint scope does not match the cell thread.');
}

function assertCheckpointScope(row, input) {
  if (row.organization_id !== input.organizationId || row.project_id !== input.projectId) {
    throw failure('CELL_CHECKPOINT_SCOPE_DENIED', 'Checkpoint belongs to another tenant.', 403);
  }
  assertThreadIdentity(row, input);
}

function verifyIntegrity(row) {
  const contextHash = sha256(row.context_json);
  const material = checkpointMaterial({
    missionId: row.mission_id, episodeId: row.episode_id, threadId: row.thread_id,
    workerId: row.worker_id, organizationId: row.organization_id,
    projectId: row.project_id, threadRevision: row.thread_revision,
    threadState: row.thread_state, contextHash, contextSize: row.context_size,
    evidenceRefs: JSON.parse(row.evidence_refs_json)
  });
  const checkpointHash = sha256(canonicalJson(material));
  if (contextHash !== row.context_hash || checkpointHash !== row.checkpoint_hash
    || Buffer.byteLength(row.context_json) !== row.context_size) {
    throw failure('CELL_CHECKPOINT_INTEGRITY_FAILED', 'Checkpoint integrity verification failed.');
  }
  return row;
}

async function scopedThread(db, input) {
  const row = await threads.requireScoped(db, input);
  assertThreadIdentity(row, input);
  return row;
}

async function seal(db, input) {
  requiredScope(input);
  await migrateCellThreadCheckpoints(db);
  const context = boundedContext(input.context);
  const evidenceRefs = boundedEvidence(input.evidenceRefs || []);
  return withTransaction(db, () => sealTransaction(db, input, { context, evidenceRefs }));
}

async function sealTransaction(db, input, prepared) {
  const { context, evidenceRefs } = prepared;
  const thread = await scopedThread(db, input);
  const existing = input.checkpointId
    ? await db.get('SELECT * FROM cell_thread_checkpoints WHERE checkpoint_id = ?',
      input.checkpointId)
    : null;
  if (existing) return reuseExisting(existing, input, prepared);
  if (!RESUMABLE.has(thread.status)) {
    throw failure('CELL_CHECKPOINT_STATE_NOT_RESUMABLE',
      `Cell thread state '${thread.status}' cannot be checkpointed for resume.`);
  }
  const material = checkpointMaterial({ ...input, threadRevision: thread.revision,
    threadState: thread.status, contextHash: context.hash, contextSize: context.size,
    evidenceRefs });
  const hash = sha256(canonicalJson(material));
  const id = checkpointId(input, hash);
  const duplicate = await db.get(`SELECT * FROM cell_thread_checkpoints
    WHERE checkpoint_hash = ?`, hash);
  if (duplicate) return reuse(duplicate, input, hash);
  const generated = await db.get('SELECT * FROM cell_thread_checkpoints WHERE checkpoint_id = ?', id);
  if (generated) return reuse(generated, input, hash);
  await db.run(`INSERT INTO cell_thread_checkpoints
    (checkpoint_id, mission_id, episode_id, thread_id, worker_id, organization_id,
      project_id, thread_revision, thread_state, context_json, context_size,
      context_hash, evidence_refs_json, checkpoint_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  id, input.missionId, input.episodeId, input.threadId, input.workerId,
  input.organizationId, input.projectId, thread.revision, thread.status,
  context.json, context.size, context.hash, JSON.stringify(evidenceRefs), hash);
  return { checkpoint: await get(db, { ...input, checkpointId: id }), idempotent: false };
}

function reuseExisting(existing, input, prepared) {
  const { context, evidenceRefs } = prepared;
  const expected = checkpointMaterial({ ...input,
    threadRevision: existing.thread_revision, threadState: existing.thread_state,
    contextHash: context.hash, contextSize: context.size, evidenceRefs });
  return reuse(existing, input, sha256(canonicalJson(expected)));
}

function reuse(existing, input, expectedHash) {
  assertCheckpointScope(existing, input);
  verifyIntegrity(existing);
  if (existing.checkpoint_hash !== expectedHash) {
    throw failure('CELL_CHECKPOINT_COLLISION', 'Checkpoint id is already bound to other content.');
  }
  return { checkpoint: format(existing), idempotent: true };
}

async function get(db, input) {
  requiredScope(input);
  if (!input.checkpointId) throw failure('CELL_CHECKPOINT_ID_REQUIRED', 'Checkpoint id is required.', 400);
  await migrateCellThreadCheckpoints(db);
  const row = await db.get('SELECT * FROM cell_thread_checkpoints WHERE checkpoint_id = ?',
    input.checkpointId);
  if (!row) throw failure('CELL_CHECKPOINT_NOT_FOUND', 'Checkpoint was not found.', 404);
  assertCheckpointScope(row, input);
  return format(verifyIntegrity(row));
}

async function resume(db, input) {
  requiredScope(input);
  if (!input.checkpointId) throw failure('CELL_CHECKPOINT_ID_REQUIRED', 'Checkpoint id is required.', 400);
  await migrateCellThreadCheckpoints(db);
  return withTransaction(db, () => resumeTransaction(db, input));
}

async function resumeTransaction(db, input) {
  const checkpoint = await get(db, input);
  const thread = await scopedThread(db, input);
  const receipt = await db.get(`SELECT * FROM cell_thread_checkpoint_resumptions
    WHERE checkpoint_id = ?`, input.checkpointId);
  if (receipt) return { checkpoint, thread: await threads.get(db, input),
    resumption: formatResumption(receipt), idempotent: true };
  if (thread.revision !== checkpoint.threadRevision || thread.status !== checkpoint.threadState) {
    throw failure('CELL_CHECKPOINT_STALE', 'Cell thread changed after this checkpoint was sealed.');
  }
  if (!RESUMABLE.has(thread.status)) {
    throw failure('CELL_CHECKPOINT_STATE_NOT_RESUMABLE', 'Cell thread is not resumable.');
  }
  const proof = await proveRuntimeResume(input.runtimeControl, checkpoint);
  const resumed = await threads.transition(db, { ...input, status: 'active',
    checkpointId: checkpoint.checkpointId, contextSize: checkpoint.contextSize });
  if (resumed.status !== 'active' || resumed.revision !== thread.revision + 1) {
    throw failure('CELL_CHECKPOINT_RESUME_INVALID', 'Cell thread resume did not create a new active revision.');
  }
  const resumptionId = `cell_resume_${sha256(input.checkpointId).slice(7, 39)}`;
  await db.run(`INSERT INTO cell_thread_checkpoint_resumptions
    (resumption_id, checkpoint_id, mission_id, episode_id, thread_id, worker_id,
      organization_id, project_id, previous_revision, resumed_revision,
      previous_state, resumed_state, proof_code, proof_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  resumptionId, input.checkpointId, input.missionId, input.episodeId, input.threadId,
  input.workerId, input.organizationId, input.projectId, thread.revision,
  resumed.revision, thread.status, proof.proofCode, proof.proofHash);
  const stored = await db.get(`SELECT * FROM cell_thread_checkpoint_resumptions
    WHERE resumption_id = ?`, resumptionId);
  return { checkpoint, thread: resumed, resumption: formatResumption(stored), idempotent: false };
}

function runtimeRequest(checkpoint) {
  return {
    checkpointId: checkpoint.checkpointId, checkpointHash: checkpoint.checkpointHash,
    missionId: checkpoint.missionId, episodeId: checkpoint.episodeId,
    threadId: checkpoint.threadId, workerId: checkpoint.workerId,
    organizationId: checkpoint.organizationId, projectId: checkpoint.projectId,
    threadRevision: checkpoint.threadRevision, threadState: checkpoint.threadState,
    context: checkpoint.context, contextSize: checkpoint.contextSize,
    contextHash: checkpoint.contextHash, evidenceRefs: checkpoint.evidenceRefs
  };
}

async function proveRuntimeResume(runtimeControl, checkpoint) {
  if (typeof runtimeControl !== 'function') {
    throw failure('CELL_CHECKPOINT_RUNTIME_UNAVAILABLE',
      'A runtime resume control is required.', 503);
  }
  const expected = runtimeRequest(checkpoint);
  let proof;
  try {
    proof = await runtimeControl(expected);
  } catch (_) {
    throw failure('CELL_CHECKPOINT_RUNTIME_REFUSED', 'Runtime resume control refused.', 409);
  }
  assertRuntimeProof(proof, expected);
  const proofCode = proof.proofCode;
  return { proofCode, proofHash: sha256(canonicalJson({ ...expected, proofCode })) };
}

function assertRuntimeProof(proof, expected) {
  const fields = ['checkpointId', 'checkpointHash', 'missionId', 'episodeId',
    'threadId', 'workerId', 'organizationId', 'projectId', 'contextHash'];
  const exact = proof?.proven === true
    && fields.every((field) => proof[field] === expected[field]);
  const validCode = typeof proof?.proofCode === 'string' && proof.proofCode.length > 0
    && Buffer.byteLength(proof.proofCode) <= MAX_PROOF_CODE_BYTES;
  if (!exact || !validCode) {
    throw failure('CELL_CHECKPOINT_RESUME_UNPROVEN',
      'Runtime resume proof is missing or bound to another cell.');
  }
}

function formatResumption(row) {
  return {
    resumptionId: row.resumption_id, checkpointId: row.checkpoint_id,
    missionId: row.mission_id, episodeId: row.episode_id,
    threadId: row.thread_id, workerId: row.worker_id,
    organizationId: row.organization_id, projectId: row.project_id,
    previousRevision: row.previous_revision, resumedRevision: row.resumed_revision,
    previousState: row.previous_state, resumedState: row.resumed_state,
    proofCode: row.proof_code, proofHash: row.proof_hash,
    createdAt: row.created_at
  };
}

module.exports = { seal, get, resume, RESUMABLE, MAX_CONTEXT_BYTES };
