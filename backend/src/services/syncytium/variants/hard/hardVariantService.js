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

function createSession(mission, options, syncytium) { const members = uniqueMembers(options.authorityMembers); const domains = [...(options.nuclearDomains || options.domains || []), { domainId: 'hard-authority', members, owns: [HARD_LEASES], mayRead: ['*'] }]; const schema = schemaService.compile({ schemaId: 'syncytium-hard-v1', fields: { ...(options.schema?.fields || {}), ...(options.fields || {}), [HARD_LEASES]: { dataType: 'MAP', consistencyZone: 'SERIALIZABLE', ownerDomain: 'hard-authority' } }, invariants: options.invariants || options.schema?.invariants || [] }); return syncytium.createSession(mission, { ...options, schema, nuclearDomains: domains }); }
function uniqueMembers(members) { const normalized = Array.isArray(members) ? [...new Set(members.map(String).map(i => i.trim()).filter(Boolean))] : []; if (!normalized.length) throw hardError('Hard sessions require authorityMembers.'); return normalized; }

async function acquireFence(sessionId, request, syncytium) { validateIdentity(request); const snapshot = await syncytium.snapshot(sessionId, request.options || {}); const current = snapshot.shared.sharedFields[HARD_LEASES]?.[request.resourceId]; const now = time(request.now); if (current?.expiresAt > now && current.holderId !== request.actorId) throw hardError('Hard resource is currently fenced by another actor.', 'SYNCYTIUM_HARD_FENCE_HELD'); const ttlMs = leaseDuration(request.ttlMs); const lease = { resourceId: request.resourceId, holderId: request.actorId, fence: (current?.fence || 0) + 1, leaseToken: randomUUID(), expiresAt: now + ttlMs }; if (!Number.isSafeInteger(lease.expiresAt)) throw hardError('Fence expiration exceeds safe timestamp range.'); const result = await syncytium.applyTransaction(sessionId, { txId: request.txId || randomUUID(), operations: [leaseOp(request, lease, 'set')], preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' }, { ...(request.options || {}), domainId: 'hard-authority' }); return { ...result, lease }; }

async function releaseFence(sessionId, request, syncytium) { validateIdentity(request); const snapshot = await syncytium.snapshot(sessionId, request.options || {}); const lease = snapshot.shared.sharedFields[HARD_LEASES]?.[request.resourceId]; const now = time(request.now); assertLeaseOwner(lease, request, now); const released = { ...lease, released: true, expiresAt: now }; return syncytium.applyTransaction(sessionId, { txId: request.txId || randomUUID(), operations: [leaseOp(request, released, 'set')], preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' }, { ...(request.options || {}), domainId: 'hard-authority' }); }

async function runFenced(sessionId, request, syncytium) { validateIdentity(request); if (!Array.isArray(request.operations) || !request.operations.length) throw hardError('Fenced transactions require operations.'); const maxRetries = request.maxRetries ?? 3; for (let attempt = 1; attempt <= maxRetries; attempt++) { const snapshot = await syncytium.snapshot(sessionId, request.options || {}); const lease = snapshot.shared.sharedFields[HARD_LEASES]?.[request.resourceId]; const now = time(request.now); if (!assertLeaseOwnerSafe(lease, request, now)) { if (attempt === maxRetries) throw hardError('Hard fence token is stale, expired or owned by another actor.', 'SYNCYTIUM_HARD_FENCE_STALE'); await sleep(50 * attempt); continue; } const ordered = orderOperations(request.operations); try { const result = await syncytium.applyTransaction(sessionId, { txId: request.txId || randomUUID(), operations: ordered.operations, preconditions: [...(request.preconditions || []), { op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE', fence: { resourceId: request.resourceId, token: request.leaseToken, number: request.fence } }, { ...(request.options || {}), domainId: request.domainId || request.nucleusId }); return { ...result, deterministicOrder: ordered.digest, retries: attempt - 1 }; } catch (e) { if ((e.code === 'SYNCYTIUM_TRANSACTION_CONFLICT' || e.code === 'SYNCYTIUM_PRECONDITION_FAILED') && attempt < maxRetries) { await sleep(50 * attempt); continue; } throw e; } } throw hardError('Fenced transaction failed after retries', 'SYNCYTIUM_FENCED_TRANSACTION_FAILED'); }

function assertLeaseOwnerSafe(lease, request, now) { return lease && lease.holderId === request.actorId && lease.fence === request.fence && lease.leaseToken === request.leaseToken && lease.expiresAt > now; }
function orderOperations(operations) { const ordered = [...operations].sort(compareOps); const digest = createHash('sha256').update(ordered.map(opKey).join('|')).digest('hex'); return { operations: ordered, digest }; }
function compareOps(l, r) { return opKey(l) < opKey(r) ? -1 : opKey(l) > opKey(r) ? 1 : 0; }
function opKey(op) { const k = op.kind || {}; const vd = createHash('sha256').update(JSON.stringify(k.value ?? null)).digest('hex').slice(0, 16); return `${k.type || ''}:${k.key || ''}:${k.entryKey || k.action || ''}:${vd}`; }

async function recoverFence(sessionId, request, syncytium) { validateIdentity(request); const snapshot = await syncytium.snapshot(sessionId, request.options || {}); const lease = snapshot.shared.sharedFields[HARD_LEASES]?.[request.resourceId]; const now = time(request.now); assertRecoverable({ lease, request, snapshot, now }); const recovered = { ...lease, recovered: true, recoveredBy: request.actorId, expiresAt: now }; return syncytium.applyTransaction(sessionId, { txId: request.txId || randomUUID(), operations: [leaseOp(request, recovered, 'set')], preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' }, { ...(request.options || {}), domainId: 'hard-authority' }); }

function assertRecoverable(ctx) { const { lease, request, snapshot, now } = ctx; if (!lease) throw hardError('No hard fence exists for recovery.', 'SYNCYTIUM_HARD_FENCE_UNKNOWN'); if (lease.expiresAt > now) throw hardError('Hard fence has not expired yet.', 'SYNCYTIUM_HARD_FENCE_ACTIVE'); const authority = snapshot.domains?.['hard-authority']?.members || []; if (!authority.includes(request.actorId)) throw hardError('Only a hard-authority member may recover an expired fence.', 'SYNCYTIUM_HARD_AUTHORITY_REQUIRED'); }

function leaseOp(request, value, action) { return { opId: request.opId || randomUUID(), actorId: request.actorId, domainId: 'hard-authority', kind: { type: 'typed_field', key: HARD_LEASES, action, entryKey: request.resourceId, value } }; }
function assertLeaseOwner(lease, request, now) { if (!lease || lease.holderId !== request.actorId || lease.fence !== request.fence || lease.leaseToken !== request.leaseToken || lease.expiresAt <= now) throw hardError('Hard fence token is stale, expired or owned by another actor.', 'SYNCYTIUM_HARD_FENCE_STALE'); }
function validateIdentity(request) { if (!request.actorId || !request.resourceId) throw hardError('Hard fence requires actorId and resourceId.'); }
function leaseDuration(value) { const ttlMs = value === undefined ? 30000 : value; if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 3600000) throw hardError('Hard fence ttlMs must be between 1 ms and one hour.'); return ttlMs; }
function time(value) { const now = value === undefined ? Date.now() : value; if (!Number.isSafeInteger(now) || now < 0) throw hardError('Hard fence time must be a non-negative safe integer.'); return now; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function hardError(message, code = 'SYNCYTIUM_HARD_FENCE_INVALID') { return Object.assign(new Error(message), { code }); }

module.exports = { createHardVariantService };