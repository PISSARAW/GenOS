'use strict';

function deny(reason, details = {}) {
  return { status: 'denied', executionAuthorized: false, reason, details };
}

function roleIdentity(role) {
  if (role?.instanceId) return `instance:${role.instanceId}`;
  if (role?.daemonId) return `daemon:${role.daemonId}`;
  return null;
}

function readyKindMap(roles) {
  const byKind = new Map();
  for (const role of roles || []) {
    addReadyRole(byKind, role);
  }
  return byKind;
}

function addReadyRole(byKind, role) {
  if (role?.status !== 'READY' || !role?.workerKind) return;
  const identity = roleIdentity(role);
  if (!identity) return;
  if (!byKind.has(role.workerKind)) byKind.set(role.workerKind, new Set());
  byKind.get(role.workerKind).add(identity);
}

function neededByKind(assignments) {
  const needed = new Map();
  for (const assignment of assignments) {
    if (!assignment?.workerKind) return null;
    needed.set(assignment.workerKind, (needed.get(assignment.workerKind) || 0) + 1);
  }
  return needed;
}

function coversAssignments(plan, resolution) {
  const assignments = Array.isArray(plan?.workerAssignments) ? plan.workerAssignments : [];
  if (!assignments.length) return false;
  const needed = neededByKind(assignments);
  if (!needed) return false;
  const byKind = readyKindMap(resolution?.roles);
  for (const [kind, count] of needed) {
    if ((byKind.get(kind)?.size || 0) < count) return false;
  }
  return true;
}

function kindByIdentityMap(resolution) {
  const map = new Map();
  for (const role of resolution?.roles || []) {
    if (role?.status !== 'READY' || !role?.workerKind) continue;
    const identity = roleIdentity(role);
    if (identity) map.set(identity, role.workerKind);
  }
  return map;
}

function reservedIdentifiers(reservation) {
  const identifiers = [];
  for (const worker of reservation?.workers || []) {
    if (worker?.instanceId) identifiers.push(`instance:${worker.instanceId}`);
  }
  for (const daemon of reservation?.daemons || []) {
    if (daemon?.daemonId) identifiers.push(`daemon:${daemon.daemonId}`);
  }
  return identifiers;
}

function availableByKind(identifiers, kindByIdentity) {
  const available = new Map();
  for (const identity of identifiers) {
    const kind = kindByIdentity.get(identity);
    if (!available.has(kind)) available.set(kind, new Set());
    available.get(kind).add(identity);
  }
  return available;
}

function consumesAssignments(assignments, available) {
  for (const assignment of assignments) {
    const candidates = available.get(assignment?.workerKind);
    if (!candidates || !candidates.size) return false;
    candidates.delete([...candidates][0]);
  }
  return true;
}

function reservationBindsAssignments(plan, resolution, reservation) {
  const assignments = Array.isArray(plan?.workerAssignments) ? plan.workerAssignments : [];
  if (!assignments.length) return false;
  const kindByIdentity = kindByIdentityMap(resolution);
  const identifiers = reservedIdentifiers(reservation);
  if (new Set(identifiers).size !== identifiers.length) return false;
  if (!identifiers.every((identity) => kindByIdentity.has(identity))) return false;
  return consumesAssignments(assignments, availableByKind(identifiers, kindByIdentity));
}

function resolutionStatusDenial(resolution) {
  if (resolution.status === 'BLOCKED') {
    return deny('resource_resolution_blocked', { missing: resolution.missing || [] });
  }
  if (resolution.status === 'READY_FOR_ADMISSION') return null;
  return deny('resource_inventory_unknown', { missing: resolution.missing || resolution.reasons || [] });
}

function staleDenial() {
  return deny('resource_inventory_unknown', { missing: ['resource_resolution_stale'] });
}

function resolutionFreshnessDenial(input) {
  const observed = Number(input.resolution.observedAt);
  if (!Number.isFinite(observed)) return staleDenial();
  if (observed > input.now) return staleDenial();
  if (input.now - observed > 30000) return staleDenial();
  return null;
}

function reservationFreshnessDenial(input, resolution) {
  const reservation = input.resourceReservation;
  if (!reservation) return deny('resource_reservation_missing');
  if (reservation.reserved !== true) return deny('resource_reservation_missing');
  if (!Number.isFinite(reservation.revalidatedAt)) return deny('resource_reservation_stale');
  if (reservation.revalidatedAt < resolution.observedAt) return deny('resource_reservation_stale');
  if (reservation.revalidatedAt > input.now) return deny('resource_reservation_stale');
  if (input.now - reservation.revalidatedAt > 30000) return deny('resource_reservation_stale');
  return null;
}

function validateResourceResolution(input, now) {
  const resolution = input.resourceResolution;
  if (!resolution) return deny('resource_resolution_missing');
  const statusDenied = resolutionStatusDenial(resolution);
  if (statusDenied) return statusDenied;
  const stale = resolutionFreshnessDenial({ resolution, now });
  if (stale) return stale;
  if (!coversAssignments(input.actualPlan, resolution)) return deny('resource_resolution_plan_mismatch');
  const fresh = reservationFreshnessDenial({ ...input, now }, resolution);
  if (fresh) return fresh;
  if (!reservationBindsAssignments(input.actualPlan, resolution, input.resourceReservation)) {
    return deny('resource_reservation_plan_mismatch');
  }
  return null;
}

module.exports = { validateResourceResolution, coversAssignments, reservationBindsAssignments };
