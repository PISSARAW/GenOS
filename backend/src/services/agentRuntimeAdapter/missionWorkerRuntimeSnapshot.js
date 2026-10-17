'use strict';

const ACTIVE_QUEUE = ['claimed', 'running'];

async function tableExists(db, name) {
  return Boolean(await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name));
}

function workerIds(assignments) {
  return [...new Set((Array.isArray(assignments) ? assignments : [])
    .map((worker) => worker?.agentId || worker?.workerId || worker?.id)
    .filter((id) => typeof id === 'string' && id.length > 0))];
}

function activeLease(row, now) {
  if (!row.queue_status || !ACTIVE_QUEUE.includes(row.queue_status)) return false;
  const expires = Date.parse(row.lease_expires_at || '');
  return row.queue_status === 'running' && row.queue_phase === 'ready'
    && typeof row.lease_id === 'string' && Number.isFinite(expires) && expires > now;
}

function observation(row, now) {
  const status = String(row.status || '').toLowerCase();
  const observed = row.queue_status || null;
  if (!workerRunnable(row, status)) {
    return { instanceId: row.id, status: 'unavailable', reason: 'worker_not_runnable', observedQueueStatus: observed };
  }
  if (workerBusy(row, status, now)) {
    return { instanceId: row.id, status: 'busy', reason: 'worker_or_lease_active', observedQueueStatus: observed };
  }
  if (status === 'idle' && !observed) {
    return { instanceId: row.id, status: 'idle_observed', reason: 'database_status_only', observedQueueStatus: null };
  }
  return { instanceId: row.id, status: 'unknown', reason: 'runtime_state_not_proven', observedQueueStatus: observed };
}

function workerRunnable(row, status) {
  return row.execution_mode === 'worker' && !['terminated', 'error', 'apoptosis'].includes(status);
}

function workerBusy(row, status, now) {
  return status === 'running' || activeLease(row, now) || isTransitioning(row.queue_phase);
}

function isTransitioning(phase) {
  return ['freezing', 'freeze_failed', 'frozen', 'thawing', 'cancelling'].includes(phase);
}

async function readMissionWorkerRuntimeSnapshot(db, assignments, now = Date.now()) {
  const ids = workerIds(assignments);
  if (!db || !ids.length || !await tableExists(db, 'agents') || !await tableExists(db, 'garage_queue')) {
    return { status: 'unknown', observedAt: now, workers: [], reason: 'runtime_tables_or_instance_ids_missing' };
  }
  try {
    return await snapshotForIds(db, ids, now);
  } catch (_) {
    return { status: 'unknown', observedAt: now, workers: [], reason: 'runtime_observation_failed' };
  }
}

async function snapshotForIds(db, ids, now) {
  const marks = ids.map(() => '?').join(',');
  const rows = await db.all(`SELECT a.id, a.status, a.execution_mode, q.status AS queue_status,
    q.phase AS queue_phase, q.lease_id, q.lease_expires_at
    FROM agents a LEFT JOIN garage_queue q ON q.worker_id = a.id
      AND (q.status IN ('claimed', 'running') OR q.phase IN ('freezing', 'freeze_failed', 'frozen', 'thawing', 'cancelling'))
    WHERE a.id IN (${marks})`, ...ids);
  const byId = new Map();
  for (const row of rows) byId.set(row.id, [...(byId.get(row.id) || []), row]);
  const workers = ids.map((id) => byId.has(id) ? observationRows(byId.get(id), now)
    : { instanceId: id, status: 'unknown', reason: 'instance_not_found' });
  return {
    status: workers.every((worker) => worker.status === 'idle_observed') ? 'idle_observed'
      : workers.some((worker) => worker.status === 'busy' || worker.status === 'unavailable') ? 'constrained' : 'unknown',
    observedAt: now,
    workers,
    authority: 'genos_database_read_only',
    limitation: 'database_observation_does_not_prove_process_liveness_or_admission'
  };
}

function observationRows(rows, now) {
  if (rows.length > 1) return { instanceId: rows[0].id, status: 'unknown', reason: 'multiple_active_queue_rows' };
  return observation(rows[0], now);
}

function firstString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function readScope(options) {
  const input = options || {};
  const source = input.scope || input.tenant || input;
  return {
    organizationId: firstString([input.organizationId, input.organization,
      source?.organizationId, source?.organization_id, source?.orgId, source?.organization]),
    projectId: firstString([input.projectId, input.project,
      source?.projectId, source?.project_id, source?.projectId]),
  };
}

function rowScope(row) {
  let meta = {};
  try { meta = JSON.parse(row?.metadata_json || '{}'); } catch (_) { meta = {}; }
  return {
    organizationId: row?.organization_id || meta.organizationId || meta.organization_id || meta.orgId || null,
    projectId: row?.project_id || meta.projectId || meta.project_id || null,
  };
}

function scopeMatches(rowScopeValue, requested) {
  if (!requested.organizationId && !requested.projectId) return true;
  if (requested.organizationId && rowScopeValue.organizationId !== requested.organizationId) return false;
  if (requested.projectId && rowScopeValue.projectId !== requested.projectId) return false;
  return true;
}

function inferPoolKind(row) {
  try {
    const meta = JSON.parse(row.metadata_json || '{}');
    const kind = meta.workerKind || meta.worker_kind;
    if (typeof kind === 'string' && kind) return kind;
  } catch (_) {}
  const role = String(row.role || '').trim();
  if (role && /^[a-z][a-z0-9_]*$/.test(role)) return role;
  return null;
}

function poolEntry(row, now) {
  const kind = inferPoolKind(row);
  if (!kind) {
    return { instanceId: row.id, workerKind: null, status: 'unknown', reason: 'worker_kind_unproven' };
  }
  if (row.status !== 'idle') {
    return { instanceId: row.id, workerKind: kind, status: 'unavailable',
      reason: 'worker_not_idle', observedQueueStatus: row.queue_status || null };
  }
  if (row.queue_status) {
    return { instanceId: row.id, workerKind: kind, status: 'busy',
      reason: 'worker_or_lease_active', observedQueueStatus: row.queue_status };
  }
  const expires = row.lease_expires_at ? Date.parse(row.lease_expires_at) : null;
  if (row.lease_expires_at && !(Number.isFinite(expires) && expires > now)) {
    return { instanceId: row.id, workerKind: kind, status: 'unknown',
      reason: 'lease_state_not_proven', observedQueueStatus: row.queue_status || null };
  }
  return { instanceId: row.id, workerKind: kind, status: 'free', reason: 'database_idle_without_active_claim',
    leaseExpiresAt: null, observedQueueStatus: null };
}

async function readFreeWorkerPoolSnapshot(db, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 50));
  if (!db || !await tableExists(db, 'agents') || !await tableExists(db, 'garage_queue')) {
    return { status: 'unknown', observedAt: now, workers: [],
      reason: 'runtime_tables_missing', authority: 'genos_database_read_only' };
  }
  try {
    return await freePoolRows(db, { now, limit, kinds: options.kinds,
     scope: options.scope, organizationId: options.organizationId, projectId: options.projectId,
     tenant: options.tenant, organization: options.organization, project: options.project });
  } catch (_) {
    return { status: 'unknown', observedAt: now, workers: [],
      reason: 'free_pool_observation_failed', authority: 'genos_database_read_only' };
  }
}

async function freePoolRows(db, options) {
  const requestedScope = readScope(options);
  const kinds = Array.isArray(options.kinds) ? options.kinds.filter((kind) => typeof kind === 'string') : [];
  const hasWorkspaces = await tableExists(db, 'workspaces');
  if (scopeUnavailable(requestedScope, hasWorkspaces)) return unknownPool(options, requestedScope);
  const rows = await queryPoolRows(db, hasWorkspaces);
  const scopedRows = dedupePoolRows(rows).filter((row) => scopeMatches(rowScope(row), requestedScope));
  const workers = poolEntries(scopedRows, options.now, kinds);
  const free = workers.filter((entry) => entry.status === 'free').length;
  return { status: free ? 'available' : 'empty', observedAt: options.now, workers,
    requestedScope: requestedScope.organizationId || requestedScope.projectId ? requestedScope : null,
    authority: 'genos_database_read_only',
    limitation: 'database_observation_does_not_prove_process_liveness_or_admission' };
}

function scopeUnavailable(scopeValue, hasWorkspaces) {
  return Boolean((scopeValue.organizationId || scopeValue.projectId) && !hasWorkspaces);
}

function unknownPool(options, requestedScope) {
  return { status: 'unknown', observedAt: options.now, workers: [], requestedScope,
    reason: 'tenant_scope_unavailable', authority: 'genos_database_read_only' };
}

async function queryPoolRows(db, hasWorkspaces) {
  const workspaceJoin = hasWorkspaces ? 'LEFT JOIN workspaces w ON w.id = a.workspace_id' : '';
  const workspaceFields = hasWorkspaces ? ', w.organization_id, w.project_id' : '';
  return db.all(`SELECT a.id, a.status, a.role, a.metadata_json${workspaceFields},
    q.status AS queue_status, q.lease_expires_at
    FROM agents a ${workspaceJoin} LEFT JOIN garage_queue q ON q.worker_id = a.id
      AND (q.status IN ('queued', 'claimed', 'running')
        OR q.phase IN ('freezing', 'freeze_failed', 'frozen', 'thawing', 'cancelling'))
    WHERE a.execution_mode = 'worker' AND a.status IN ('idle', 'running')
    ORDER BY CASE WHEN a.status = 'idle' THEN 0 ELSE 1 END, a.id`);
}

function poolEntries(rows, now, kinds) {
  return rows.map((row) => {
    const entry = poolEntry(row, now);
    const scope = rowScope(row);
    return { ...entry, organizationId: scope.organizationId, projectId: scope.projectId };
  }).filter((entry) => !kinds.length || entry.workerKind === null || kinds.includes(entry.workerKind));
}

function dedupePoolRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const existing = grouped.get(row.id);
    if (!existing) grouped.set(row.id, row);
    else grouped.set(row.id, { ...existing, queue_status: 'multiple', lease_expires_at: null });
  }
  return [...grouped.values()];
}

async function readDaemonRuntimeSnapshot(db, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  if (!db || !await tableExists(db, 'daemon_runtime_state')) {
    return { status: 'unknown', observedAt: now, daemons: [],
      reason: 'daemon_tables_missing', authority: 'genos_database_read_only' };
  }
  try {
    return await daemonRows(db, now);
  } catch (_) {
    return { status: 'unknown', observedAt: now, daemons: [],
      reason: 'daemon_observation_failed', authority: 'genos_database_read_only' };
  }
}

async function daemonRows(db, now) {
  const hasTerritories = await tableExists(db, 'daemon_territories');
  const rows = hasTerritories
    ? await db.all(`SELECT r.daemon_id, r.territory_id, r.activity, r.health,
        r.last_heartbeat_at, t.state AS territory_state
      FROM daemon_runtime_state r LEFT JOIN daemon_territories t ON t.id = r.territory_id
      ORDER BY r.daemon_id LIMIT 100`)
    : await db.all(`SELECT daemon_id, territory_id, activity, health,
        last_heartbeat_at, NULL AS territory_state FROM daemon_runtime_state ORDER BY daemon_id LIMIT 100`);
  const daemons = rows.map((row) => daemonEntry(row, now));
  const live = daemons.filter((entry) => entry.live).length;
  return { status: live ? 'available' : 'empty', observedAt: now, daemons,
    authority: 'genos_database_read_only',
    limitation: 'database_observation_does_not_prove_process_liveness_or_admission' };
}

function daemonEntry(row, now) {
  const beat = Date.parse(row.last_heartbeat_at || '');
  const fresh = Number.isFinite(beat) && beat <= now && now - beat <= 60000;
  const healthy = ['HEALTHY', 'STRESSED'].includes(row.health);
  const territoryOk = row.territory_state === null
    || ['BOOTSTRAPPING', 'SURVEYING', 'ACTIVE', 'DORMANT'].includes(row.territory_state);
  return { daemonId: row.daemon_id, territoryId: row.territory_id, activity: row.activity,
    health: row.health, territoryState: row.territory_state, lastHeartbeatAt: row.last_heartbeat_at,
    live: Boolean(fresh && healthy && territoryOk) };
}

module.exports = { readMissionWorkerRuntimeSnapshot, readFreeWorkerPoolSnapshot, readDaemonRuntimeSnapshot };
