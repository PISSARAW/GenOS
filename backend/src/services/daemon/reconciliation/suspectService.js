'use strict';

/**
 * Suspect Service — registre de l'autophagie prudente (ADR 0034 D22).
 *
 * Règle d'autorité : le Reconciler ne mute jamais une ressource qu'il
 * ne possède pas (agents, workspaces, capsules). Il fiche un SUSPECT
 * (detect → mark), revérifie la liveness à chaque sweep, passe
 * RESOLVED quand la ressource revit, et laisse l'owner (governance,
 * worker) agir. Seules les tables daemon_* sont mutées par ailleurs.
 *
 * Toute détection est gardée : table absente → [] (pas de throw).
 */

const { migrateDaemonSuspects } = require('../../../db/migrations/migrateDaemonSuspects');

const KINDS = ['blocked-agent', 'stale-runtime', 'orphan-workspace', 'stuck-capsule', 'abandoned-branch'];

async function upsertSuspect(db, sighting) {
  await migrateDaemonSuspects(db);
  const before = await db.get(
    'SELECT status FROM daemon_reconcile_suspects WHERE territory_id = ? AND kind = ? AND ref = ?',
    sighting.territoryId,
    sighting.kind,
    sighting.ref
  );
  await db.run(
    `INSERT INTO daemon_reconcile_suspects (territory_id, kind, ref, status, sightings, detail_json, first_seen, last_seen)
     VALUES (?, ?, ?, 'SUSPECT', 1, ?, datetime('now'), datetime('now'))
     ON CONFLICT(territory_id, kind, ref) DO UPDATE SET
       status = 'SUSPECT', sightings = sightings + 1, last_seen = datetime('now'),
       detail_json = excluded.detail_json`,
    sighting.territoryId,
    sighting.kind,
    sighting.ref,
    JSON.stringify(sighting.detail || {})
  );
  return { isNew: !before || before.status !== 'SUSPECT' };
}

async function markResolved(db, job) {
  await migrateDaemonSuspects(db);
  const res = await db.run(
    `UPDATE daemon_reconcile_suspects SET status = 'RESOLVED', last_seen = datetime('now')
     WHERE territory_id = ? AND kind = ? AND ref = ? AND status = 'SUSPECT'`,
    job.territoryId,
    job.kind,
    job.ref
  );
  return { resolved: ((res && res.changes) || 0) > 0 };
}

async function listSuspects(db, query) {
  await migrateDaemonSuspects(db);
  return db.all(
    'SELECT * FROM daemon_reconcile_suspects WHERE territory_id = ? AND status = ? ORDER BY last_seen DESC',
    query.territoryId,
    query.status || 'SUSPECT'
  );
}

async function guardedAll(db, sql, params) {
  try {
    return (await db.all(sql, ...params)) || [];
  } catch (_) {
    return [];
  }
}

async function findBlockedAgents(db, cutoffIso) {
  return guardedAll(db,
    `SELECT id FROM agents WHERE status IN ('blocked', 'error')
     AND datetime(updated_at) <= datetime(?)`,
    [cutoffIso]);
}

async function findStaleRuntimes(db, cutoffIso) {
  return guardedAll(db,
    `SELECT id FROM agents WHERE runtime_pid IS NOT NULL AND status != 'running'
     AND datetime(updated_at) <= datetime(?)`,
    [cutoffIso]);
}

async function findOrphanWorkspaces(db, cutoffIso) {
  return guardedAll(db,
    `SELECT w.id FROM workspaces w LEFT JOIN agents a ON a.workspace_id = w.id
     WHERE a.id IS NULL AND COALESCE(w.is_archived, 0) = 0
     AND datetime(w.updated_at) <= datetime(?)`,
    [cutoffIso]);
}

async function findStuckCapsules(db, cutoffIso) {
  return guardedAll(db,
    `SELECT id FROM cryptobiosis_snapshots WHERE status IN ('freezing', 'thawing')
     AND datetime(frozen_at) <= datetime(?)`,
    [cutoffIso]);
}

async function findAbandonedBranches(db, job) {
  try {
    const { migrateDaemonRepair } = require('../../../db/migrations/migrateDaemonRepair');
    await migrateDaemonRepair(db);
    return (await db.all(
      `SELECT id, branch_name FROM daemon_repair_episodes
       WHERE territory_id = ? AND status = 'FAILED'
       AND datetime(updated_at) <= datetime(?)`,
      job.territoryId,
      job.cutoffIso
    )) || [];
  } catch (_) {
    return [];
  }
}

module.exports = {
  KINDS,
  upsertSuspect,
  markResolved,
  listSuspects,
  findBlockedAgents,
  findStaleRuntimes,
  findOrphanWorkspaces,
  findStuckCapsules,
  findAbandonedBranches
};
