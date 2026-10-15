'use strict';

const { randomUUID } = require('node:crypto');
const { migrateMissionEpisodes } = require('../db/migrations/migrateMissionEpisodes');

const TRANSITIONS = {
  embryonic: ['active', 'failed', 'cancelled'],
  active: ['quiescent', 'completed', 'failed', 'cancelled'],
  quiescent: ['active', 'failed', 'cancelled'],
  completed: [], failed: [], cancelled: []
};

function failure(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

function scopeOf(input) {
  if (!input?.organizationId || !input.projectId) {
    throw failure('MISSION_EPISODE_SCOPE_REQUIRED', 'Organization and project scope are required.', 400);
  }
  return { organizationId: input.organizationId, projectId: input.projectId };
}

function format(row) {
  if (!row) return null;
  return {
    episodeId: row.episode_id, missionId: row.mission_id,
    organizationId: row.organization_id, projectId: row.project_id,
    organismId: row.organism_id, organismRevision: row.organism_revision,
    epigenomeRevision: row.epigenome_revision, habitatId: row.habitat_id,
    habitatRevision: row.habitat_revision, orchestratorId: row.orchestrator_id,
    rootThreadId: row.root_thread_id,
    status: row.status, revision: row.revision, metadata: JSON.parse(row.metadata_json),
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

async function create(db, input) {
  await migrateMissionEpisodes(db);
  const scope = scopeOf(input);
  assertEpisodeInput(input);
  await assertMissionCanStartEpisode(db, input.missionId);
  await assertMissionScope(db, input.missionId, scope);
  const episodeId = input.episodeId || `episode_${randomUUID()}`;
  await db.run(`INSERT INTO mission_episodes
    (episode_id, mission_id, organization_id, project_id, organism_id,
      organism_revision, epigenome_revision, habitat_id, habitat_revision,
      orchestrator_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  episodeId, input.missionId, scope.organizationId, scope.projectId,
  input.organismId || null, input.organismRevision, input.epigenomeRevision || null,
  input.habitatId || null, input.habitatRevision || null, input.orchestratorId || null,
  JSON.stringify(input.metadata || {}));
  return get(db, { ...scope, episodeId });
}

function assertEpisodeInput(input) {
  if (!input.missionId || !input.organismRevision) {
    throw failure('MISSION_EPISODE_INVALID', 'Mission and organism revision are required.', 400);
  }
  if (input.habitatRevision !== undefined
    && (!Number.isSafeInteger(input.habitatRevision) || input.habitatRevision < 1)) {
    throw failure('MISSION_EPISODE_HABITAT_REVISION_INVALID',
      'Habitat revision must be a positive integer.', 400);
  }
}

async function assertMissionCanStartEpisode(db, missionId) {
  const mission = await db.get('SELECT status FROM missions WHERE mission_id = ?', missionId);
  if (!mission) throw failure('MISSION_EPISODE_MISSION_NOT_FOUND', 'Mission was not found.', 404);
  if (['active', 'dormant'].includes(mission.status)) return;
  throw failure('MISSION_EPISODE_MISSION_TERMINAL', 'A terminal mission cannot start an episode.');
}

async function assertMissionScope(db, missionId, scope) {
  const row = await db.get(`SELECT organization_id, project_id FROM mission_episodes
    WHERE mission_id = ? LIMIT 1`, missionId);
  if (row && (row.organization_id !== scope.organizationId || row.project_id !== scope.projectId)) {
    throw failure('MISSION_EPISODE_SCOPE_DENIED', 'Mission is already bound to another tenant.', 403);
  }
}

async function get(db, input) {
  await migrateMissionEpisodes(db);
  const scope = scopeOf(input);
  const row = await db.get(`SELECT * FROM mission_episodes WHERE episode_id = ?
    AND organization_id = ? AND project_id = ?`, input.episodeId,
  scope.organizationId, scope.projectId);
  return format(row);
}

async function requireScoped(db, input) {
  const scope = scopeOf(input);
  const row = await db.get('SELECT * FROM mission_episodes WHERE episode_id = ?', input.episodeId);
  if (!row) throw failure('MISSION_EPISODE_NOT_FOUND', 'Mission episode was not found.', 404);
  if (row.organization_id !== scope.organizationId || row.project_id !== scope.projectId) {
    throw failure('MISSION_EPISODE_SCOPE_DENIED', 'Mission episode belongs to another tenant.', 403);
  }
  if (input.missionId && row.mission_id !== input.missionId) {
    throw failure('MISSION_EPISODE_MISSION_MISMATCH', 'Mission episode belongs to another mission.', 409);
  }
  return row;
}

async function list(db, input) {
  await migrateMissionEpisodes(db);
  const scope = scopeOf(input);
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
  const rows = input.missionId
    ? await db.all(`SELECT * FROM mission_episodes WHERE organization_id = ?
      AND project_id = ? AND mission_id = ? ORDER BY created_at DESC LIMIT ?`,
    scope.organizationId, scope.projectId, input.missionId, limit)
    : await db.all(`SELECT * FROM mission_episodes WHERE organization_id = ?
      AND project_id = ? ORDER BY created_at DESC LIMIT ?`,
    scope.organizationId, scope.projectId, limit);
  return rows.map(format);
}

async function transition(db, input) {
  await migrateMissionEpisodes(db);
  const current = await requireScoped(db, input);
  if (current.status === input.status) return format(current);
  if (!TRANSITIONS[current.status]?.includes(input.status)) {
    throw failure('MISSION_EPISODE_INVALID_TRANSITION',
      `Invalid mission episode transition ${current.status} -> ${input.status}.`);
  }
  const result = await db.run(`UPDATE mission_episodes SET status = ?, revision = revision + 1,
    updated_at = CURRENT_TIMESTAMP WHERE episode_id = ? AND status = ? AND revision = ?`,
  input.status, input.episodeId, current.status, current.revision);
  if (result.changes !== 1) {
    throw failure('MISSION_EPISODE_REVISION_CONFLICT', 'Mission episode changed concurrently.');
  }
  return get(db, input);
}

async function remove(db, input) {
  await migrateMissionEpisodes(db);
  const current = await requireScoped(db, input);
  if (current.status !== 'embryonic') {
    throw failure('MISSION_EPISODE_DELETE_DENIED', 'Only an empty embryonic episode can be deleted.');
  }
  const children = await db.get('SELECT COUNT(*) AS count FROM cell_threads WHERE episode_id = ?', input.episodeId);
  if (children.count) throw failure('MISSION_EPISODE_DELETE_DENIED', 'Episode still owns cell threads.');
  await db.run('DELETE FROM mission_episodes WHERE episode_id = ?', input.episodeId);
  return true;
}

module.exports = { create, get, list, transition, remove, requireScoped, TRANSITIONS };
