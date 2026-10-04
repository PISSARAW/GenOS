'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { createHash, randomUUID } = require('node:crypto');

const MAX_TRANSACTION_RETRIES = 20;

function createTransactionalVariantService(syncytium) {
  return {
    createTransactionalSession: (mission, options) => createSession(mission, options, syncytium),
    reserveResources: (sessionId, request) => reserve(sessionId, request, syncytium),
    releaseReservation: (sessionId, request) => release(sessionId, request, syncytium),
    sweepExpiredReservations: (sessionId, request) => sweepExpired(sessionId, request, syncytium),
    detectReservationDeadlock: (waitEdges) => detectReservationDeadlock(waitEdges || []),
    transactionalSnapshot: (sessionId, options) => transactionalSnapshot(sessionId, options, syncytium)
  };
}

function createSession(mission, options = {}, syncytium) {
  const resources = options.resources || {};
  return syncytium.createSession(mission, {
    ...options,
    schema: schemaService.compile({
      schemaId: 'syncytium-transactional-v1',
      fields: {
        budget: escrow(resources.budget),
        inventory: escrow(resources.inventory),
        capacity: escrow(resources.capacity),
        reservations: { dataType: 'MAP', consistencyZone: 'SERIALIZABLE' }
      }
    })
  });
}

function escrow(allocations = {}) {
  return { dataType: 'ESCROW_COUNTER', consistencyZone: 'INVARIANT_PRESERVING', escrowAllocations: allocations };
}

async function reserve(sessionId, request = {}, syncytium) {
  validateRequest(request);
  const transactionRequest = { ...request, txId: request.txId || randomUUID() };
  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt += 1) {
    const snapshot = await syncytium.snapshot(sessionId, request.options || {});
    const reservations = snapshot.shared.sharedFields.reservations || {};
    const replayed = findIdempotentReplay(reservations, transactionRequest);
    if (replayed) return { replayed: true, reservation: replayed, snapshot };
    if (request.stateVersion !== undefined && request.stateVersion !== snapshot.shared.totalOps) {
      throw Object.assign(new Error('Reservation stateVersion precondition is stale.'), { code: 'SYNCYTIUM_PRECONDITION_FAILED' });
    }
    const reservationId = transactionRequest.reservationId || randomUUID();
    const operations = resourceOperations(transactionRequest, reservationId);
    operations.push(mapOperation({ request: transactionRequest, reservationId, action: 'set',
      value: reservationValue(transactionRequest, reservationId) }));
    try {
      const result = await syncytium.applyTransaction(sessionId, {
        txId: transactionRequest.txId, operations,
        preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
      }, request.options || {});
      return { replayed: false, reservationId, ...result };
    } catch (error) {
      if (error.code !== 'SYNCYTIUM_PRECONDITION_FAILED') throw error;
    }
  }
  throw Object.assign(new Error('Reservation remained contended after bounded retries.'), { code: 'SYNCYTIUM_RESERVATION_CONTENDED' });
}

function findIdempotentReplay(reservations, request) {
  if (!request.idempotencyKey) return null;
  const existing = Object.values(reservations || {}).find((item) => item.idempotencyKey === request.idempotencyKey);
  const matches = existing && existing.actorId === request.actorId
    && (existing.requestFingerprint ? existing.requestFingerprint === requestFingerprint(request) : legacyRequestMatches(existing, request));
  if (existing && !matches) {
    throw Object.assign(new Error('Idempotency key was already used for a different reservation request.'), {
      code: 'SYNCYTIUM_IDEMPOTENCY_KEY_REUSED'
    });
  }
  return existing || null;
}

function legacyRequestMatches(existing, request) {
  const expectedTtl = request.ttlMs === undefined || request.ttlMs === null ? null : request.ttlMs;
  const storedTtl = existing.leaseExpiresAt === null ? null : existing.leaseExpiresAt - existing.createdAt;
  return existing.budget === (request.budget || 0) && existing.inventory === (request.inventory || 0)
    && existing.capacity === (request.capacity || 0) && storedTtl === expectedTtl
    && JSON.stringify(canonicalize(existing.metadata || null)) === JSON.stringify(canonicalize(request.metadata || null));
}

function resourceOperations(request, reservationId) {
  return ['budget', 'inventory', 'capacity']
    .filter((field) => request[field] > 0)
    .map((field) => ({
      opId: operationId(request, field), actorId: request.actorId,
      kind: { type: 'typed_field', key: field, action: 'consume', amount: request[field] },
      reservationId
    }));
}

function reservationValue(request, reservationId) {
  return {
    reservationId, actorId: request.actorId,
    budget: request.budget || 0, inventory: request.inventory || 0,
    capacity: request.capacity || 0, metadata: request.metadata || null,
    idempotencyKey: request.idempotencyKey || null,
    requestFingerprint: request.idempotencyKey ? requestFingerprint(request) : null,
    leaseExpiresAt: leaseExpiry(request),
    createdAt: reservationNow(request)
  };
}

function leaseExpiry(request) {
  if (request.ttlMs === undefined || request.ttlMs === null) return null;
  if (!Number.isSafeInteger(request.ttlMs) || request.ttlMs < 1) throw inputError('Reservation ttlMs must be a positive safe integer.');
  const expiresAt = reservationNow(request) + request.ttlMs;
  if (!Number.isSafeInteger(expiresAt)) throw inputError('Reservation lease expiration is outside the safe integer range.');
  return expiresAt;
}

function reservationNow(request) {
  return Number.isSafeInteger(request.now) ? request.now : Date.now();
}

async function release(sessionId, request = {}, syncytium) {
  if (!request.reservationId || !request.actorId) throw inputError('A reservationId and actorId are required.');
  const transactionRequest = { ...request, txId: request.txId || randomUUID() };
  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt += 1) {
    const snapshot = await syncytium.snapshot(sessionId, request.options || {});
    const reservation = snapshot.shared.sharedFields.reservations?.[request.reservationId];
    if (!reservation || reservation.actorId !== request.actorId) {
      throw Object.assign(new Error('Reservation is missing or owned by another actor.'), { code: 'SYNCYTIUM_RESERVATION_NOT_FOUND' });
    }
    try {
      return await syncytium.applyTransaction(sessionId, {
        txId: transactionRequest.txId, operations: reservationReleaseOperations(reservation, transactionRequest),
        preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
      }, request.options || {});
    } catch (error) {
      if (error.code !== 'SYNCYTIUM_PRECONDITION_FAILED') throw error;
    }
  }
  throw Object.assign(new Error('Reservation release remained contended after bounded retries.'), { code: 'SYNCYTIUM_RESERVATION_CONTENDED' });
}

function reservationReleaseOperations(reservation, request) {
  const operations = ['budget', 'inventory', 'capacity'].filter((field) => reservation[field] > 0).map((field) => ({
    opId: operationId(request, `release-${field}`), actorId: request.actorId,
    kind: { type: 'typed_field', key: field, action: 'release', amount: reservation[field] }
  }));
  operations.push(mapOperation({ request, reservationId: reservation.reservationId, action: 'delete' }));
  return operations;
}

function mapOperation(context) {
  const { request, reservationId, action, value } = context;
  return {
    opId: operationId(request, 'reservation'), actorId: request.actorId,
    kind: { type: 'typed_field', key: 'reservations', action, entryKey: reservationId, value }
  };
}

function validateRequest(request) {
  if (typeof request.actorId !== 'string' || !request.actorId.trim()) throw inputError('A resource reservation requires an actorId.');
  if (request.reservationId !== undefined && (typeof request.reservationId !== 'string' || !request.reservationId.trim())) {
    throw inputError('reservationId must be a non-empty string when provided.');
  }
  if (request.idempotencyKey !== undefined && (typeof request.idempotencyKey !== 'string' || !request.idempotencyKey.trim())) {
    throw inputError('idempotencyKey must be a non-empty string when provided.');
  }
  if (request.ttlMs !== undefined && request.ttlMs !== null
    && (!Number.isSafeInteger(request.ttlMs) || request.ttlMs < 1
      || !Number.isSafeInteger(reservationNow(request) + request.ttlMs))) {
    throw inputError('Reservation ttlMs must be positive and produce a safe expiration timestamp.');
  }
  for (const field of ['budget', 'inventory', 'capacity']) {
    const amount = request[field] === undefined ? 0 : request[field];
    if (!Number.isSafeInteger(amount) || amount < 0) throw inputError(`${field} must be a non-negative safe integer.`);
  }
  if (![request.budget, request.inventory, request.capacity].some((amount) => amount > 0)) {
    throw inputError('A reservation must consume at least one resource.');
  }
}

function operationId(request, field) {
  return `${request.txId || randomUUID()}:${field}`;
}

function requestFingerprint(request) {
  const intent = { actorId: request.actorId, budget: request.budget || 0, inventory: request.inventory || 0,
    capacity: request.capacity || 0, metadata: request.metadata || null, ttlMs: request.ttlMs ?? null };
  const canonical = JSON.stringify(canonicalize(intent));
  return createHash('sha256').update(canonical).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

async function transactionalSnapshot(sessionId, options, syncytium) {
  const result = await syncytium.snapshot(sessionId, options || {});
  const fields = result.shared.sharedFields;
  return { ...result, resources: { budget: fields.budget || 0, inventory: fields.inventory || 0,
    capacity: fields.capacity || 0, reservations: fields.reservations || {} } };
}

async function sweepExpired(sessionId, request = {}, syncytium) {
  const now = Number.isSafeInteger(request.now) ? request.now : Date.now();
  const transactionId = request.txId || randomUUID();
  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt += 1) {
    const snapshot = await syncytium.snapshot(sessionId, request.options || {});
    const expired = Object.values(snapshot.shared.sharedFields.reservations || {})
      .filter((item) => Number.isSafeInteger(item.leaseExpiresAt) && item.leaseExpiresAt <= now);
    if (!expired.length) return { swept: [], sweptCount: 0, now };
    const operations = expired.flatMap((reservation) => reservationReleaseOperations(reservation, {
      ...request, txId: `${transactionId}:${reservation.reservationId}`, actorId: reservation.actorId
    }));
    try {
      const result = await syncytium.applyTransaction(sessionId, { txId: transactionId, operations,
        preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
      }, request.options || {});
      return { ...result, swept: expired.map((item) => item.reservationId), sweptCount: expired.length, now };
    } catch (error) {
      if (error.code !== 'SYNCYTIUM_PRECONDITION_FAILED') throw error;
    }
  }
  throw Object.assign(new Error('Reservation sweep remained contended after bounded retries.'), { code: 'SYNCYTIUM_RESERVATION_CONTENDED' });
}

function detectReservationDeadlock(waitEdges) {
  const graph = new Map();
  for (const edge of waitEdges || []) appendWaitEdge(graph, edge);
  for (const holder of graph.keys()) {
    const cycle = findWaitCycle(graph, holder);
    if (cycle) return { deadlocked: true, cycle, victim: cycle[cycle.length - 1] };
  }
  return { deadlocked: false, cycle: [], victim: null };
}

function appendWaitEdge(graph, edge) {
  if (!edge || !edge.waiter || !edge.holder) return;
  if (!graph.has(edge.waiter)) graph.set(edge.waiter, []);
  graph.get(edge.waiter).push(edge.holder);
}

function findWaitCycle(graph, start) {
  return depthFirst({ graph, start, current: start, visited: new Set(), path: [] });
}

function depthFirst(context) {
  const { graph, start, current, visited, path } = context;
  if (visited.has(current)) return current === start && path.length > 0 ? [...path, start] : null;
  const nextPath = [...path, current];
  const holders = graph.get(current) || [];
  for (const holder of holders) {
    const cycle = depthFirst({ graph, start, current: holder, visited: new Set([...visited, current]), path: nextPath });
    if (cycle) return cycle;
  }
  return null;
}

function inputError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_RESERVATION_INVALID' });
}

module.exports = { createTransactionalVariantService, detectReservationDeadlock };
