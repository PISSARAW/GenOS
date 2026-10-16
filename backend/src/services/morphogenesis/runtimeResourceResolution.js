'use strict';

const FRESHNESS_MS = 30000;
const DAEMON_FRESHNESS_MS = 60000;
const LIVE_HEALTH = new Set(['HEALTHY', 'STRESSED']);
const LIVE_TERRITORY = new Set(['BOOTSTRAPPING', 'SURVEYING', 'ACTIVE', 'DORMANT']);

function nowOf(input) {
  const value = Number(input.now);
  if (Number.isFinite(value)) return value;
  return Date.now();
}

function isFresh(options) {
  const observed = Number(options.observedAt);
  const now = Number(options.now);
  if (!Number.isFinite(observed)) return false;
  if (observed > now) return false;
  return now - observed <= options.ttl;
}

function baseReceipt(options) {
  return {
    schemaVersion: 1,
    kind: 'runtime_resource_resolution',
    status: options.status,
    observedAt: observedAtOf(options.input),
    now: options.now,
    freshnessMs: FRESHNESS_MS,
    authority: 'genos_database_read_only',
    limitation: 'database_observation_does_not_prove_process_liveness_or_admission',
    executionAuthorized: false,
    revalidationRequired: true,
    roles: [],
    missing: [],
    reasons: [],
    ...(options.extra || {})
  };
}

function unknownReceipt(input, reason) {
  const now = nowOf(input);
  return baseReceipt({ input, status: 'UNKNOWN', now,
    extra: { reasons: [reason], missing: [reason] } });
}

function observedAtOf(input) {
  const poolAt = input.freeWorkerPool ? input.freeWorkerPool.observedAt : null;
  const daemonAt = input.daemonInventory ? input.daemonInventory.observedAt : null;
  const candidates = [input.observedAt, poolAt, daemonAt].filter(Number.isFinite);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}

function poolContradiction(pool) {
  const seen = new Map();
  for (const worker of pool.workers || []) {
    if (!worker) continue;
    if (typeof worker.instanceId !== 'string') continue;
    const key = [worker.instanceId, worker.workerKind, worker.status].join('|');
    if (seen.has(worker.instanceId)) {
      if (seen.get(worker.instanceId) !== key) return true;
    }
    seen.set(worker.instanceId, key);
  }
  return false;
}

function leaseValid(options) {
  const expires = options.worker.leaseExpiresAt;
  if (expires === null) return true;
  if (expires === undefined) return true;
  if (!Number.isFinite(expires)) return false;
  return expires > options.now;
}

function matchesFree(options) {
  if (!options.worker) return false;
  if (options.worker.workerKind !== options.kind) return false;
  if (options.worker.status !== 'free') return false;
  if (options.taken.has(options.worker.instanceId)) return false;
  return leaseValid({ worker: options.worker, now: options.now });
}

function findFreeInstance(options) {
  return (options.pool.workers || []).find((worker) => matchesFree({
    worker, kind: options.kind, now: options.now, taken: options.taken
  }));
}

function heartbeatFresh(entry, now) {
  const beat = Date.parse(entry.lastHeartbeatAt || '');
  if (!Number.isFinite(beat)) return false;
  if (beat > now) return false;
  return now - beat <= DAEMON_FRESHNESS_MS;
}

function daemonLive(options) {
  if (!options.entry) return false;
  if (typeof options.entry.daemonId !== 'string') return false;
  if (!LIVE_HEALTH.has(options.entry.health)) return false;
  if (!LIVE_TERRITORY.has(options.entry.territoryState)) return false;
  return heartbeatFresh(options.entry, options.now);
}

function blockedRole(role, reason) {
  return { roleId: role.roleId, workerKind: role.workerKind, methodId: role.methodId || null,
    status: 'BLOCKED', instanceId: null, reasons: [reason] };
}

function resolveWorkerRole(options) {
  const instance = findFreeInstance({ pool: options.pool, kind: options.role.workerKind,
    now: options.now, taken: options.taken });
  if (!instance) return blockedRole(options.role, `no free instance for kind ${options.role.workerKind}`);
  options.taken.add(instance.instanceId);
  return { roleId: options.role.roleId, workerKind: options.role.workerKind,
    methodId: options.role.methodId || null, status: 'READY', instanceId: instance.instanceId,
    leaseExpiresAt: instance.leaseExpiresAt ?? null, observedAt: options.pool.observedAt,
    reasons: ['requires_atomic_revalidation_before_dispatch'] };
}

function daemonNotAllowed(options) {
  if (options.daemonAllowed === false) return 'daemon explicitly disabled';
  return 'daemon authorization missing';
}

function pickLiveDaemon(options) {
  return (options.daemons || []).find((entry) => daemonFree({ entry, taken: options.taken, now: options.now }));
}

function daemonFree(options) {
  if (options.taken.has(`daemon:${options.entry.daemonId}`)) return false;
  return daemonLive({ entry: options.entry, now: options.now });
}

function resolveDaemonRole(options) {
  if (options.daemonAllowed !== true) return blockedRole(options.role, daemonNotAllowed(options));
  const live = pickLiveDaemon({ daemons: options.inventory.daemons, taken: options.taken, now: options.now });
  if (!live) return blockedRole(options.role, daemonMissingReason(options.inventory));
  options.taken.add(`daemon:${live.daemonId}`);
  return { roleId: options.role.roleId, workerKind: options.role.workerKind,
    methodId: options.role.methodId || null, status: 'READY', instanceId: null,
    daemonId: live.daemonId, territoryId: live.territoryId,
    observedAt: options.inventory.observedAt,
    reasons: ['requires_atomic_revalidation_and_explicit_wake'] };
}

function daemonMissingReason(inventory) {
  const count = (inventory.daemons || []).length;
  if (count === 0) return 'no live daemon observed';
  return 'no live daemon with fresh heartbeat';
}

function roleNeedsDaemon(role) {
  if (role.workerKind === 'resident_daemon') return true;
  return role.requiresDaemon === true;
}

function resolveOneRole(options) {
  if (roleNeedsDaemon(options.role)) {
    return resolveDaemonRole({ role: options.role, daemonAllowed: options.input.daemonAllowed,
      inventory: options.input.daemonInventory, taken: options.taken, now: options.now });
  }
  return resolveWorkerRole({ role: options.role, pool: options.input.freeWorkerPool,
    taken: options.taken, now: options.now });
}

function aggregateStatus(roles) {
  let blocked = false;
  for (const role of roles) {
    if (role.status === 'BLOCKED') blocked = true;
  }
  if (blocked) return 'BLOCKED';
  return 'READY_FOR_ADMISSION';
}

function checkPool(input, now) {
  if (!input.freeWorkerPool) return 'free_worker_inventory_unavailable';
  if (!Number.isFinite(input.freeWorkerPool.observedAt)) return 'free_worker_inventory_unavailable';
  if (!isFresh({ observedAt: input.freeWorkerPool.observedAt, now, ttl: FRESHNESS_MS })) {
    return 'free_worker_inventory_stale';
  }
  if (poolContradiction(input.freeWorkerPool)) return 'free_worker_inventory_contradictory';
  return null;
}

function checkDaemons(input, roles, now) {
  let needed = false;
  for (const role of roles) {
    if (roleNeedsDaemon(role)) needed = true;
  }
  if (!needed) return null;
  if (!input.daemonInventory) return 'daemon_inventory_unavailable';
  if (!isFresh({ observedAt: input.daemonInventory.observedAt, now, ttl: FRESHNESS_MS })) {
    return 'daemon_inventory_stale';
  }
  return null;
}

function finalizeResolution(input, roles, now) {
  const taken = new Set();
  const resolved = roles.map((role) => resolveOneRole({ role, input, taken, now }));
  const status = aggregateStatus(resolved);
  const missing = [];
  for (const role of resolved) {
    if (role.status !== 'READY') missing.push(`${role.roleId}:${role.reasons[0]}`);
  }
  const reasons = status === 'READY_FOR_ADMISSION' ? ['revalidation_required_before_dispatch'] : missing;
  return { ...baseReceipt({ input, status, now }), roles: resolved, missing, reasons };
}

function resolveRuntimeResources(input = {}) {
  const now = nowOf(input);
  const roles = Array.isArray(input.roles) ? input.roles : [];
  if (!roles.length) {
    return { ...baseReceipt({ input, status: 'UNKNOWN', now }), reasons: ['roles_required'] };
  }
  const poolError = checkPool(input, now);
  if (poolError) return unknownReceipt(input, poolError);
  const daemonError = checkDaemons(input, roles, now);
  if (daemonError) return unknownReceipt(input, daemonError);
  return finalizeResolution(input, roles, now);
}

module.exports = { FRESHNESS_MS, DAEMON_FRESHNESS_MS, resolveRuntimeResources };
