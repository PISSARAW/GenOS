'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

function createTransactionalVariantService(syncytium) {
  return {
    createTransactionalSession: (mission, options) => createSession(mission, options, syncytium),
    reserveResources: (sessionId, request) => reserveAtomic(sessionId, request, syncytium),
    releaseReservation: (sessionId, request) => release(sessionId, request, syncytium),
    sweepExpiredReservations: (sessionId, request) => sweepExpiredAtomic(sessionId, request, syncytium),
    detectReservationDeadlock: (waitEdges) => detectReservationDeadlock(waitEdges || []),
    transactionalSnapshot: (sessionId, options) => transactionalSnapshot(sessionId, options, syncytium)
  };
}

function createSession(mission, options, syncytium) {
  const resources = options.resources || {};
  return syncytium.createSession(mission, { ...options, schema: schemaService.compile({ schemaId: 'syncytium-transactional-v1', fields: { budget: escrow(resources.budget), inventory: escrow(resources.inventory), capacity: escrow(resources.capacity), reservations: { dataType: 'MAP', consistencyZone: 'SERIALIZABLE' }, sweepLog: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' } } }) });
}

function escrow(allocations) { return { dataType: 'ESCROW_COUNTER', consistencyZone: 'INVARIANT_PRESERVING', escrowAllocations: allocations }; }

async function reserveAtomic(sessionId, request, syncytium) {
  validateRequest(request);
  const maxRetries = request.maxRetries ?? 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const snapshot = await syncytium.snapshot(sessionId, request.options || {});
    const reservations = snapshot.shared.sharedFields.reservations || {};
    const replayed = findIdempotentReplay(reservations, request);
    if (replayed) return { replayed: true, reservation: replayed, snapshot, retries: attempt - 1 };
    const reservationId = request.reservationId || randomUUID();
    const ops = buildResourceOps(request, reservationId);
    ops.push(mapOp({ request, reservationId, action: 'set', value: reservationValue(request, reservationId) }));
    try { return { replayed: false, reservationId, ...(await syncytium.applyTransaction(sessionId, { txId: request.txId || randomUUID(), operations: ops, preconditions: request.stateVersion === undefined ? [] : [{ op: 'state_version', value: request.stateVersion }], commitPolicy: 'SERIALIZABLE' }, request.options || {})), retries: attempt - 1 }; } catch (e) { if ((e.code === 'SYNCYTIUM_TRANSACTION_CONFLICT' || e.code === 'SYNCYTIUM_PRECONDITION_FAILED') && attempt < maxRetries) { await sleep(50 * attempt); continue; } throw e; }
  }
  throw hardError('Reservation failed after retries', 'SYNCYTIUM_RESERVATION_FAILED');
}

function findIdempotentReplay(reservations, request) { if (!request.idempotencyKey) return null; return Object.values(reservations || {}).find(item => item.idempotencyKey === request.idempotencyKey) || null; }
function buildResourceOps(request, reservationId) { return ['budget', 'inventory', 'capacity'].filter(f => request[f] > 0).map(f => ({ opId: opId(request, f), actorId: request.actorId, kind: { type: 'typed_field', key: f, action: 'consume', amount: request[f] }, reservationId })); }
function reservationValue(request, reservationId) { return { reservationId, actorId: request.actorId, budget: request.budget || 0, inventory: request.inventory || 0, capacity: request.capacity || 0, metadata: request.metadata || null, idempotencyKey: request.idempotencyKey || null, leaseExpiresAt: leaseExpiry(request), createdAt: Date.now() }; }
function leaseExpiry(request) { if (request.ttlMs === undefined || request.ttlMs === null) return null; if (!Number.isSafeInteger(request.ttlMs) || request.ttlMs < 1) throw inputError('Reservation ttlMs must be a positive safe integer.'); return Date.now() + request.ttlMs; }

async function release(sessionId, request, syncytium) {
  if (!request.reservationId || !request.actorId) throw inputError('A reservationId and actorId are required.');
  const maxRetries = request.maxRetries ?? 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const snapshot = await syncytium.snapshot(sessionId, request.options || {});
    const reservation = snapshot.shared.sharedFields.reservations?.[request.reservationId];
    if (!reservation || reservation.actorId !== request.actorId) throw Object.assign(new Error('Reservation is missing or owned by another actor.'), { code: 'SYNCYTIUM_RESERVATION_NOT_FOUND' });
    const ops = ['budget', 'inventory', 'capacity'].filter(f => reservation[f] > 0).map(f => ({ opId: opId(request, `release-${f}`), actorId: request.actorId, kind: { type: 'typed_field', key: f, action: 'release', amount: reservation[f] } }));
    ops.push(mapOp({ request, reservationId: request.reservationId, action: 'delete' }));
    try { return await syncytium.applyTransaction(sessionId, { txId: request.txId || randomUUID(), operations: ops, preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' }, request.options || {}); } catch (e) { if ((e.code === 'SYNCYTIUM_TRANSACTION_CONFLICT' || e.code === 'SYNCYTIUM_PRECONDITION_FAILED') && attempt < maxRetries) { await sleep(50 * attempt); continue; } throw e; }
  }
  throw hardError('Release failed after retries', 'SYNCYTIUM_RELEASE_FAILED');
}

function mapOp(ctx) { const { request, reservationId, action, value } = ctx; return { opId: opId(request, 'reservation'), actorId: request.actorId, kind: { type: 'typed_field', key: 'reservations', action, entryKey: reservationId, value } }; }

function validateRequest(request) { if (!request.actorId) throw inputError('A resource reservation requires an actorId.'); for (const f of ['budget', 'inventory', 'capacity']) { const a = request[f] || 0; if (!Number.isSafeInteger(a) || a < 0) throw inputError(`${f} must be a non-negative safe integer.`); } if (![request.budget, request.inventory, request.capacity].some(a => a > 0)) throw inputError('A reservation must consume at least one resource.'); }

function opId(request, field) { return `${request.txId || randomUUID()}:${field}`; }

async function transactionalSnapshot(sessionId, options, syncytium) { const r = await syncytium.snapshot(sessionId, options || {}); const f = r.shared.sharedFields; return { ...r, resources: { budget: f.budget || 0, inventory: f.inventory || 0, capacity: f.capacity || 0, reservations: f.reservations || {} } }; }

async function sweepExpiredAtomic(sessionId, request, syncytium) {
  const now = Number.isSafeInteger(request.now) ? request.now : Date.now();
  const maxRetries = request.maxRetries ?? 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const snapshot = await syncytium.snapshot(sessionId, request.options || {});
    const reservations = snapshot.shared.sharedFields.reservations || {};
    const expired = Object.values(reservations).filter(item => Number.isSafeInteger(item.leaseExpiresAt) && item.leaseExpiresAt <= now);
    if (!expired.length) return { swept: [], sweptCount: 0, now, retries: attempt - 1 };
    const ops = []; const sweptIds = [];
    for (const res of expired) {
      for (const f of ['budget', 'inventory', 'capacity'].filter(f => res[f] > 0)) ops.push({ opId: opId({ ...request, txId: `${request.txId}:${res.reservationId}` }, `sweep-${f}`), actorId: res.actorId, kind: { type: 'typed_field', key: f, action: 'release', amount: res[f] } });
      ops.push(mapOp({ request: { ...request, actorId: res.actorId }, reservationId: res.reservationId, action: 'delete' }));
      sweptIds.push(res.reservationId);
    }
    try {
      await syncytium.applyTransaction(sessionId, { txId: request.txId || randomUUID(), operations: ops, preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' }, request.options || {});
      await syncytium.applyOperation(sessionId, { opId: randomUUID(), actorId: 'sweep-daemon', kind: { type: 'typed_field', key: 'sweepLog', action: 'add', value: { sweptIds, sweptAt: now, count: sweptIds.length } } }, request.options || {});
      return { swept: sweptIds, sweptCount: sweptIds.length, now, retries: attempt - 1 };
    } catch (e) { if ((e.code === 'SYNCYTIUM_TRANSACTION_CONFLICT' || e.code === 'SYNCYTIUM_PRECONDITION_FAILED') && attempt < maxRetries) { await sleep(50 * attempt); continue; } throw e; }
  }
  throw hardError('Sweep failed after retries', 'SYNCYTIUM_SWEEP_FAILED');
}

function detectReservationDeadlock(waitEdges) { const g = new Map(); for (const e of waitEdges || []) if (e?.waiter && e?.holder) { if (!g.has(e.waiter)) g.set(e.waiter, []); g.get(e.waiter).push(e.holder); } for (const h of g.keys()) { const cycle = findCycle(g, h); if (cycle) return { deadlocked: true, cycle, victim: cycle[cycle.length - 1] }; } return { deadlocked: false, cycle: [], victim: null }; }
function findCycle(g, start) { return dfs({ g, start, cur: start, vis: new Set(), path: [] }); }
function dfs(ctx) { const { g, start, cur, vis, path } = ctx; if (vis.has(cur)) return cur === start && path.length > 0 ? [...path, start] : null; const np = [...path, cur]; for (const h of g.get(cur) || []) { const c = dfs({ g, start, cur: h, vis: new Set([...vis, cur]), path: np }); if (c) return c; } return null; }

function inputError(msg) { return Object.assign(new Error(msg), { code: 'SYNCYTIUM_RESERVATION_INVALID' }); }
function hardError(msg, code = 'SYNCYTIUM_TRANSACTIONAL_ERROR') { return Object.assign(new Error(msg), { code }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { createTransactionalVariantService, detectReservationDeadlock };