'use strict';

const { withTransaction } = require('../../db');
const { FRESHNESS_MS } = require('./runtimeResourceResolution');

function freshReceipt(resolution, now) {
  return resolution
    && resolution.status === 'READY_FOR_ADMISSION'
    && Number.isFinite(resolution.observedAt)
    && resolution.observedAt <= now
    && now - resolution.observedAt <= FRESHNESS_MS;
}

function firstString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function agentScopeMatches(agent, scope) {
  if (!scope || (!scope.organizationId && !scope.projectId)) return true;
  let meta = {};
  try { meta = JSON.parse(agent?.metadata_json || '{}'); } catch (_) { meta = {}; }
  const org = firstString([agent?.organization_id, meta.organizationId, meta.organization_id, meta.orgId]);
  const project = firstString([agent?.project_id, meta.projectId, meta.project_id]);
  if (scope.organizationId && org !== scope.organizationId) return false;
  if (scope.projectId && project !== scope.projectId) return false;
  return true;
}

async function workerAvailable(params) {
  const { db, instanceId, scope } = params;
  const agent = await db.get('SELECT id, status, metadata_json FROM agents WHERE id = ?', instanceId);
  if (!agent || agent.status !== 'idle') return false;
  if (!agentScopeMatches(agent, scope)) return false;
  const busy = await db.get(`SELECT request_id FROM garage_queue WHERE worker_id = ?
    AND (status IN ('queued','claimed','running')
      OR phase IN ('freezing','freeze_failed','frozen','thawing','cancelling')) LIMIT 1`, instanceId);
  if (busy) return false;
  return true;
}

async function claimWorker(params) {
  const { db, instanceId, now, scope } = params;
  if (!await workerAvailable({ db, instanceId, now, scope })) return false;
  const result = await db.run(`UPDATE agents SET status = 'running', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'idle'`, instanceId);
  return Boolean(result && result.changes === 1);
}

async function daemonAvailable(db, daemonId, now) {
  const row = await db.get(`SELECT r.daemon_id, r.activity, r.health, r.last_heartbeat_at,
    t.state AS territory_state FROM daemon_runtime_state r
    JOIN daemon_territories t ON t.id = r.territory_id WHERE r.daemon_id = ?`, daemonId);
  if (!row) return { available: false, reason: 'daemon_not_registered' };
  if (!['HEALTHY', 'STRESSED'].includes(row.health)) return { available: false, reason: `daemon_health_${row.health}` };
  if (!['BOOTSTRAPPING', 'SURVEYING', 'ACTIVE', 'DORMANT'].includes(row.territory_state)) {
    return { available: false, reason: `daemon_territory_${row.territory_state}` };
  }
  const beat = Date.parse(row.last_heartbeat_at || '');
  if (!Number.isFinite(beat) || beat > now || now - beat > 60000) {
    return { available: false, reason: 'daemon_heartbeat_stale' };
  }
  return { available: true, activity: row.activity };
}

async function wakeDaemon(db, daemonId, availability) {
  if (!availability.available) return { woke: false, reason: availability.reason };
  if (['FOCUSED', 'INVESTIGATING', 'VERIFYING', 'REPORTING'].includes(availability.activity)) {
    return { woke: true, reason: 'daemon_already_awake' };
  }
  if (availability.activity !== 'DORMANT' && availability.activity !== 'SURVEYING') {
    return { woke: false, reason: `daemon_activity_${availability.activity}_not_wakeable` };
  }
  const result = await db.run(`UPDATE daemon_runtime_state SET activity = 'FOCUSED',
    last_heartbeat_at = datetime('now'), updated_at = datetime('now')
    WHERE daemon_id = ? AND activity = ?`, daemonId, availability.activity);
  if (!result || result.changes !== 1) return { woke: false, reason: 'daemon_wake_race_lost' };
  return { woke: true, reason: 'daemon_woken_dormant_to_focused' };
}

async function reserveInsideTransaction(db, resolution, now) {
  const scope = resolution?.requestedScope || null;
  const workers = [];
  const daemons = [];
  for (const role of resolution.roles || []) {
    if (role.status !== 'READY') return { reserved: false, reason: `role_not_ready:${role.roleId}` };
    if (role.daemonId) {
      const availability = await daemonAvailable(db, role.daemonId, now);
      const wake = await wakeDaemon(db, role.daemonId, availability);
      if (!wake.woke) return { reserved: false, reason: `daemon_wake_failed:${wake.reason}` };
      daemons.push({ roleId: role.roleId, daemonId: role.daemonId, woke: wake.woke, reason: wake.reason });
    } else if (role.instanceId) {
      const claimed = await claimWorker({ db, instanceId: role.instanceId, now, scope });
      if (!claimed) return { reserved: false, reason: `worker_race_lost:${role.instanceId}` };
      workers.push({ roleId: role.roleId, instanceId: role.instanceId });
    } else {
      return { reserved: false, reason: `role_unresolved:${role.roleId}` };
    }
  }
  return { reserved: true, workers, daemons, revalidatedAt: now, requestedScope: scope };
}

async function revalidateAndReserveResources(db, resolution, nowInput) {
  const now = Number.isFinite(nowInput) ? nowInput : Date.now();
  if (!freshReceipt(resolution, now)) {
    return { reserved: false, reason: 'resolution_not_ready_or_stale', revalidatedAt: now };
  }
  try {
    return await withTransaction(db, () => reserveInsideTransaction(db, resolution, now));
  } catch (error) {
    return { reserved: false, reason: error.message || 'reservation_failed', revalidatedAt: now };
  }
}

async function releaseWorkerReservation(db, instanceId) {
  const busy = await db.get(`SELECT request_id FROM garage_queue WHERE worker_id = ?
    AND status IN ('queued','claimed','running') LIMIT 1`, instanceId);
  if (busy) return false;
  const result = await db.run(`UPDATE agents SET status = 'idle', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'running'`, instanceId);
  return Boolean(result && result.changes === 1);
}

module.exports = { revalidateAndReserveResources, releaseWorkerReservation };
