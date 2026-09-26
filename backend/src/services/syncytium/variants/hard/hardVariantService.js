'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID, createHash } = require('node:crypto');

const HARD_LEASES = 'hard.leases';

function createHardVariantService(syncytium) {
  return {
    createHardSession: (mission, options) => createSession(mission, options, syncytium),
    acquireHardFence: (sessionId, request) => acquireFence(sessionId, request, syncytium),
    releaseHardFence: (sessionId, request) => releaseFence(sessionId, request, syncytium),
    recoverExpiredFence: (sessionId, request) => recoverFence(sessionId, request, syncytium),
    runFencedTransaction: (sessionId, request) => runFenced(sessionId, request, syncytium)
  };
}

function createSession(mission, options = {}, syncytium) {
  const members = uniqueMembers(options.authorityMembers);
  const domains = [...(options.nuclearDomains || options.domains || []), {
    domainId: 'hard-authority', members, owns: [HARD_LEASES], mayRead: ['*']
  }];
  const schema = schemaService.compile({
    schemaId: 'syncytium-hard-v1',
    fields: { ...(options.schema?.fields || {}), ...(options.fields || {}),
      [HARD_LEASES]: { dataType: 'MAP', consistencyZone: 'SERIALIZABLE', ownerDomain: 'hard-authority' } },
    invariants: options.invariants || options.schema?.invariants || []
  });
  return syncytium.createSession(mission, { ...options, schema, nuclearDomains: domains });
}

function uniqueMembers(members) {
  const normalized = Array.isArray(members) ? [...new Set(members.map(String).map((item) => item.trim()).filter(Boolean))] : [];
  if (!normalized.length) throw hardError('Hard sessions require authorityMembers.');
  return normalized;
}

async function acquireFence(sessionId, request = {}, syncytium) {
  validateIdentity(request);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const current = snapshot.shared.sharedFields[HARD_LEASES]?.[request.resourceId];
  const now = time(request.now);
  if (current?.expiresAt > now && current.holderId !== request.actorId) throw hardError('Hard resource is currently fenced by another actor.', 'SYNCYTIUM_HARD_FENCE_HELD');
  const ttlMs = leaseDuration(request.ttlMs);
  const lease = { resourceId: request.resourceId, holderId: request.actorId,
    fence: (current?.fence || 0) + 1, leaseToken: randomUUID(), expiresAt: now + ttlMs };
  if (!Number.isSafeInteger(lease.expiresAt)) throw hardError('Fence expiration exceeds safe timestamp range.');
  const result = await syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations: [leaseOperation(request, lease, 'set')],
    preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, { ...(request.options || {}), domainId: 'hard-authority' });
  return { ...result, lease };
}

async function releaseFence(sessionId, request = {}, syncytium) {
  validateIdentity(request);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const lease = snapshot.shared.sharedFields[HARD_LEASES]?.[request.resourceId];
  const now = time(request.now);
  assertLeaseOwner(lease, request, now);
  const released = { ...lease, released: true, expiresAt: now };
  return syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations: [leaseOperation(request, released, 'set')],
    preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, { ...(request.options || {}), domainId: 'hard-authority' });
}

async function runFenced(sessionId, request = {}, syncytium) {
  validateIdentity(request);
  if (!Array.isArray(request.operations) || !request.operations.length) throw hardError('Fenced transactions require operations.');
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const lease = snapshot.shared.sharedFields[HARD_LEASES]?.[request.resourceId];
  assertLeaseOwner(lease, request, time(request.now));
  const ordered = orderOperations(request.operations);
  const result = await syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations: ordered.operations,
    preconditions: [...(request.preconditions || []), { op: 'state_version', value: snapshot.shared.totalOps }],
    commitPolicy: 'SERIALIZABLE', fence: { resourceId: request.resourceId, token: request.leaseToken, number: request.fence }
  }, { ...(request.options || {}), domainId: request.domainId || request.nucleusId });
  return { ...result, deterministicOrder: ordered.digest };
}

function orderOperations(operations) {
  const ordered = [...operations].sort(compareOperations);
  const digest = createHash('sha256').update(ordered.map(operationKey).join('|')).digest('hex');
  return { operations: ordered, digest };
}

function compareOperations(left, right) {
  return operationKey(left) < operationKey(right) ? -1 : operationKey(left) > operationKey(right) ? 1 : 0;
}

function operationKey(operation) {
  const kind = operation.kind || {};
  const valueDigest = createHash('sha256').update(JSON.stringify(kind.value ?? null)).digest('hex').slice(0, 16);
  return `${kind.type || ''}:${kind.key || ''}:${kind.entryKey || kind.action || ''}:${valueDigest}`;
}

async function recoverFence(sessionId, request = {}, syncytium) {
  validateIdentity(request);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const lease = snapshot.shared.sharedFields[HARD_LEASES]?.[request.resourceId];
  const now = time(request.now);
  assertRecoverable({ lease, request, snapshot, now });
  const recovered = { ...lease, recovered: true, recoveredBy: request.actorId, expiresAt: now };
  return syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations: [leaseOperation(request, recovered, 'set')],
    preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, { ...(request.options || {}), domainId: 'hard-authority' });
}

function assertRecoverable(context) {
  const { lease, request, snapshot, now } = context;
  if (!lease) throw hardError('No hard fence exists for recovery.', 'SYNCYTIUM_HARD_FENCE_UNKNOWN');
  if (lease.expiresAt > now) throw hardError('Hard fence has not expired yet.', 'SYNCYTIUM_HARD_FENCE_ACTIVE');
  const authority = snapshot.domains?.['hard-authority']?.members || [];
  if (!authority.includes(request.actorId)) throw hardError('Only a hard-authority member may recover an expired fence.', 'SYNCYTIUM_HARD_AUTHORITY_REQUIRED');
}

function leaseOperation(request, value, action) {
  return { opId: request.opId || randomUUID(), actorId: request.actorId, domainId: 'hard-authority',
    kind: { type: 'typed_field', key: HARD_LEASES, action, entryKey: request.resourceId, value } };
}

function assertLeaseOwner(lease, request, now) {
  if (!lease || lease.holderId !== request.actorId || lease.fence !== request.fence
    || lease.leaseToken !== request.leaseToken || lease.expiresAt <= now) {
    throw hardError('Hard fence token is stale, expired or owned by another actor.', 'SYNCYTIUM_HARD_FENCE_STALE');
  }
}

function validateIdentity(request) {
  if (!request.actorId || !request.resourceId) throw hardError('Hard fence requires actorId and resourceId.');
}

function leaseDuration(value) {
  const ttlMs = value === undefined ? 30000 : value;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 3600000) throw hardError('Hard fence ttlMs must be between 1 ms and one hour.');
  return ttlMs;
}

function time(value) {
  const now = value === undefined ? Date.now() : value;
  if (!Number.isSafeInteger(now) || now < 0) throw hardError('Hard fence time must be a non-negative safe integer.');
  return now;
}

function hardError(message, code = 'SYNCYTIUM_HARD_FENCE_INVALID') {
  return Object.assign(new Error(message), { code });
}

module.exports = { createHardVariantService };
