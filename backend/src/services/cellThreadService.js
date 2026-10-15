'use strict';

const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../db');
const episodes = require('./missionEpisodeService');
const { migrateMissionEpisodes } = require('../db/migrations/migrateMissionEpisodes');

const TRANSITIONS = {
  embryonic: ['ready', 'failed', 'quarantined', 'apoptotic'],
  ready: ['active', 'failed', 'quarantined', 'apoptotic'],
  active: ['waiting_signal', 'waiting_permission', 'budget_quiescent',
    'evidence_quiescent', 'completed_execution', 'failed', 'quarantined', 'apoptotic'],
  waiting_signal: ['active', 'failed', 'quarantined', 'apoptotic'],
  waiting_permission: ['active', 'failed', 'quarantined', 'apoptotic'],
  budget_quiescent: ['active', 'failed', 'quarantined', 'apoptotic'],
  evidence_quiescent: ['active', 'failed', 'quarantined', 'apoptotic'],
  completed_execution: ['fossilized'], failed: ['fossilized'],
  quarantined: ['active', 'apoptotic', 'fossilized'], apoptotic: ['fossilized'], fossilized: []
};
const KINDS = new Set(['orchestrator', 'worker', 'verifier', 'advisor']);

function failure(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

function format(row) {
  if (!row) return null;
  return {
    threadId: row.thread_id, episodeId: row.episode_id, missionId: row.mission_id,
    organizationId: row.organization_id, projectId: row.project_id,
    parentThreadId: row.parent_thread_id, workerId: row.worker_id,
    cellKind: row.cell_kind, status: row.status, stopReason: row.stop_reason,
    checkpointId: row.checkpoint_id, contextSize: row.context_size,
    revision: row.revision, metadata: JSON.parse(row.metadata_json),
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

async function create(db, input) {
  await migrateMissionEpisodes(db);
  validateCreate(input);
  const episode = await episodes.requireScoped(db, input);
  if (!['embryonic', 'active', 'quiescent'].includes(episode.status)) {
    throw failure('CELL_THREAD_EPISODE_TERMINAL', 'A terminal episode cannot create cell threads.');
  }
  await assertParent(db, input);
  const threadId = input.threadId || `thread_${randomUUID()}`;
  await withTransaction(db, () => persist(db, { ...input, threadId }));
  return get(db, { ...input, threadId });
}

async function persist(db, input) {
  await db.run(`INSERT INTO cell_threads
    (thread_id, episode_id, mission_id, organization_id, project_id,
      parent_thread_id, worker_id, cell_kind, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.threadId, input.episodeId, input.missionId,
  input.organizationId, input.projectId, input.parentThreadId || null,
  input.workerId, input.cellKind, JSON.stringify(input.metadata || {}));
  if (!input.parentThreadId) await bindRoot(db, input);
}

async function bindRoot(db, input) {
  const result = await db.run(`UPDATE mission_episodes SET root_thread_id = ?,
    updated_at = CURRENT_TIMESTAMP WHERE episode_id = ? AND root_thread_id IS NULL`,
  input.threadId, input.episodeId);
  if (result.changes !== 1) {
    throw failure('CELL_THREAD_ROOT_CONFLICT', 'Mission episode already has a root cell thread.');
  }
}

function validateCreate(input) {
  if (!input?.workerId || !input.missionId || !input.episodeId || !KINDS.has(input.cellKind)) {
    throw failure('CELL_THREAD_INVALID', 'Worker, kind, mission and episode are required.', 400);
  }
  if (!input.parentThreadId && input.cellKind !== 'orchestrator') {
    throw failure('CELL_THREAD_ROOT_KIND_INVALID', 'The root cell thread must be an orchestrator.', 400);
  }
}

async function assertParent(db, input) {
  if (!input.parentThreadId) return;
  const parent = await db.get('SELECT * FROM cell_threads WHERE thread_id = ?', input.parentThreadId);
  if (!parent) throw failure('CELL_THREAD_PARENT_NOT_FOUND', 'Parent cell thread was not found.', 404);
  const match = parent.episode_id === input.episodeId && parent.mission_id === input.missionId
    && parent.organization_id === input.organizationId && parent.project_id === input.projectId;
  if (!match) throw failure('CELL_THREAD_PARENT_MISMATCH', 'Parent cell thread has another mission or scope.');
  if (['fossilized', 'apoptotic'].includes(parent.status)) {
    throw failure('CELL_THREAD_PARENT_TERMINAL', 'A terminal cell thread cannot create descendants.');
  }
}

async function get(db, input) {
  await migrateMissionEpisodes(db);
  const row = await db.get(`SELECT * FROM cell_threads WHERE thread_id = ?
    AND organization_id = ? AND project_id = ?`, input.threadId,
  input.organizationId, input.projectId);
  return format(row);
}

async function requireScoped(db, input) {
  const row = await db.get('SELECT * FROM cell_threads WHERE thread_id = ?', input.threadId);
  if (!row) throw failure('CELL_THREAD_NOT_FOUND', 'Cell thread was not found.', 404);
  if (row.organization_id !== input.organizationId || row.project_id !== input.projectId) {
    throw failure('CELL_THREAD_SCOPE_DENIED', 'Cell thread belongs to another tenant.', 403);
  }
  if (input.missionId && row.mission_id !== input.missionId) {
    throw failure('CELL_THREAD_MISSION_MISMATCH', 'Cell thread belongs to another mission.');
  }
  return row;
}

async function list(db, input) {
  await migrateMissionEpisodes(db);
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
  const rows = await db.all(`SELECT * FROM cell_threads WHERE episode_id = ?
    AND organization_id = ? AND project_id = ? ORDER BY created_at, thread_id LIMIT ?`,
  input.episodeId, input.organizationId, input.projectId, limit);
  return rows.map(format);
}

async function transition(db, input) {
  await migrateMissionEpisodes(db);
  const current = await requireScoped(db, input);
  if (current.status === input.status) return format(current);
  if (!TRANSITIONS[current.status]?.includes(input.status)) {
    throw failure('CELL_THREAD_INVALID_TRANSITION',
      `Invalid cell thread transition ${current.status} -> ${input.status}.`);
  }
  const stopReason = terminal(input.status) ? input.stopReason || input.status : null;
  const result = await db.run(`UPDATE cell_threads SET status = ?, stop_reason = ?,
    checkpoint_id = COALESCE(?, checkpoint_id), context_size = COALESCE(?, context_size),
    revision = revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE thread_id = ? AND status = ? AND revision = ?`, input.status, stopReason,
  input.checkpointId || null, validContext(input.contextSize), input.threadId,
  current.status, current.revision);
  if (result.changes !== 1) throw failure('CELL_THREAD_REVISION_CONFLICT', 'Cell thread changed concurrently.');
  return get(db, input);
}

function terminal(status) {
  return ['completed_execution', 'failed', 'quarantined', 'apoptotic', 'fossilized'].includes(status);
}

function validContext(value) {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw failure('CELL_THREAD_CONTEXT_INVALID', 'Context size must be a nonnegative integer.', 400);
  }
  return value;
}

async function remove(db, input) {
  await migrateMissionEpisodes(db);
  const current = await requireScoped(db, input);
  if (current.status !== 'embryonic') {
    throw failure('CELL_THREAD_DELETE_DENIED', 'Only an embryonic leaf thread can be deleted.');
  }
  const children = await db.get('SELECT COUNT(*) AS count FROM cell_threads WHERE parent_thread_id = ?', input.threadId);
  if (children.count) throw failure('CELL_THREAD_DELETE_DENIED', 'Cell thread still owns descendants.');
  await withTransaction(db, async () => {
    await db.run('DELETE FROM cell_threads WHERE thread_id = ?', input.threadId);
    if (!current.parent_thread_id) await db.run(`UPDATE mission_episodes SET root_thread_id = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE episode_id = ? AND root_thread_id = ?`,
    current.episode_id, current.thread_id);
  });
  return true;
}

module.exports = { create, get, list, transition, remove, requireScoped, TRANSITIONS };
