'use strict';

function firstString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function requestScope(input) {
  const source = input?.scope || input?.tenant || input || {};
  const assignments = Array.isArray(input?.assignments) ? input.assignments : [];
  const assignmentScope = assignments.find((item) => item && typeof item === 'object') || {};
  return {
    organizationId: firstString([input?.organizationId, input?.organization, source?.organizationId,
      source?.organization_id, source?.orgId, assignmentScope.organizationId, assignmentScope.organization_id,
      assignmentScope.orgId]),
    projectId: firstString([input?.projectId, input?.project, source?.projectId, source?.project_id,
      assignmentScope.projectId, assignmentScope.project_id]),
  };
}

async function snapshotInventories(db, now, scope) {
  const snapshots = require('../agentRuntimeAdapter/missionWorkerRuntimeSnapshot');
  try {
    const pool = await snapshots.readFreeWorkerPoolSnapshot(db, {
      now, limit: 100, scope, organizationId: scope?.organizationId, projectId: scope?.projectId });
    const inventory = await snapshots.readDaemonRuntimeSnapshot(db, { now });
    if (!pool || !inventory) return null;
    return { pool, inventory };
  } catch (_) {
    return null;
  }
}

function rolesForAssignments(assignments) {
  return assignments.map((assignment, index) => ({ roleId: `slot-${index + 1}`,
    workerKind: assignment?.workerKind || null }));
}

function resolveRoles(input) {
  const resolution = require('./runtimeResourceResolution');
  try {
    return resolution.resolveRuntimeResources({ roles: input.roles,
      freeWorkerPool: input.pool, daemonInventory: input.inventory,
      daemonAllowed: input.daemonAllowed, observedAt: input.now, now: input.now });
  } catch (_) {
    return null;
  }
}

async function reserveRoles(input) {
  const reservation = require('./runtimeResourceReservation');
  try {
    return await reservation.revalidateAndReserveResources(input.db, input.resolution, input.now);
  } catch (_) {
    return null;
  }
}

async function resolveAndReserve(input) {
  const empty = { resolution: null, reservation: null };
  const assignments = Array.isArray(input.assignments) ? input.assignments : [];
  if (!input.db || !assignments.length) return empty;
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const scope = requestScope(input);
  const inventories = await snapshotInventories(input.db, now, scope);
  if (!inventories) return empty;
  const roles = rolesForAssignments(assignments);
  if (roles.some((role) => !role.workerKind)) return empty;
  return reserveReady({ db: input.db, roles, inventories,
    daemonAllowed: input.daemonAllowed, now, requestedScope: scope });
}

async function reserveReady(input) {
  const resolution = resolveRoles({ roles: input.roles, pool: input.inventories.pool,
    inventory: input.inventories.inventory, daemonAllowed: input.daemonAllowed, now: input.now });
  if (!resolution || resolution.status !== 'READY_FOR_ADMISSION') {
    return { resolution, reservation: null };
  }
  if (input.requestedScope && (input.requestedScope.organizationId || input.requestedScope.projectId)) {
    resolution.requestedScope = input.requestedScope;
  }
  const reservation = await reserveRoles({ db: input.db, resolution, now: input.now });
  if (!reservation || reservation.reserved !== true) return { resolution, reservation: null };
  if (input.requestedScope) reservation.requestedScope = input.requestedScope;
  return { resolution, reservation };
}

async function releaseAdmissionReservation(db, admission) {
  const reservation = admission?.resourceReservation;
  if (!reservation || reservation.reserved !== true || !db) return 0;
  const workers = Array.isArray(reservation.workers) ? reservation.workers : [];
  let released = 0;
  for (const worker of workers) {
    if (await releaseWorker(db, worker?.instanceId)) released += 1;
  }
  return released;
}

async function releaseWorker(db, instanceId) {
  if (!instanceId) return false;
  try {
    return await require('./runtimeResourceReservation').releaseWorkerReservation(db, instanceId);
  } catch (_) {
    return false;
  }
}

module.exports = { resolveAndReserve, releaseAdmissionReservation };
