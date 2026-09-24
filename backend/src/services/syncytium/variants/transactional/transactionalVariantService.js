'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

function createTransactionalVariantService(syncytium) {
  return {
    createTransactionalSession: (mission, options) => createSession(mission, options, syncytium),
    reserveResources: (sessionId, request) => reserve(sessionId, request, syncytium),
    releaseReservation: (sessionId, request) => release(sessionId, request, syncytium),
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
  const reservationId = request.reservationId || randomUUID();
  const operations = resourceOperations(request, reservationId);
  operations.push(mapOperation({ request, reservationId, action: 'set', value: reservationValue(request, reservationId) }));
  return syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations,
    preconditions: request.stateVersion === undefined ? [] : [{ op: 'state_version', value: request.stateVersion }],
    commitPolicy: 'SERIALIZABLE'
  }, request.options || {});
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
    capacity: request.capacity || 0, metadata: request.metadata || null
  };
}

async function release(sessionId, request = {}, syncytium) {
  if (!request.reservationId || !request.actorId) throw inputError('A reservationId and actorId are required.');
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const reservation = snapshot.shared.sharedFields.reservations?.[request.reservationId];
  if (!reservation || reservation.actorId !== request.actorId) {
    throw Object.assign(new Error('Reservation is missing or owned by another actor.'), { code: 'SYNCYTIUM_RESERVATION_NOT_FOUND' });
  }
  const operations = ['budget', 'inventory', 'capacity'].filter((field) => reservation[field] > 0).map((field) => ({
    opId: operationId(request, `release-${field}`), actorId: request.actorId,
    kind: { type: 'typed_field', key: field, action: 'release', amount: reservation[field] }
  }));
  operations.push(mapOperation({ request, reservationId: request.reservationId, action: 'delete' }));
  return syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations,
    preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }],
    commitPolicy: 'SERIALIZABLE'
  }, request.options || {});
}

function mapOperation(context) {
  const { request, reservationId, action, value } = context;
  return {
    opId: operationId(request, 'reservation'), actorId: request.actorId,
    kind: { type: 'typed_field', key: 'reservations', action, entryKey: reservationId, value }
  };
}

function validateRequest(request) {
  if (!request.actorId) throw inputError('A resource reservation requires an actorId.');
  for (const field of ['budget', 'inventory', 'capacity']) {
    const amount = request[field] || 0;
    if (!Number.isSafeInteger(amount) || amount < 0) throw inputError(`${field} must be a non-negative safe integer.`);
  }
  if (![request.budget, request.inventory, request.capacity].some((amount) => amount > 0)) {
    throw inputError('A reservation must consume at least one resource.');
  }
}

function operationId(request, field) {
  return `${request.txId || randomUUID()}:${field}`;
}

async function transactionalSnapshot(sessionId, options, syncytium) {
  const result = await syncytium.snapshot(sessionId, options || {});
  const fields = result.shared.sharedFields;
  return { ...result, resources: { budget: fields.budget || 0, inventory: fields.inventory || 0,
    capacity: fields.capacity || 0, reservations: fields.reservations || {} } };
}

function inputError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_RESERVATION_INVALID' });
}

module.exports = { createTransactionalVariantService };
