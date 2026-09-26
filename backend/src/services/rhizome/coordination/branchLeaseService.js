'use strict';

const { objectValue, textValue, isoDateOrNull } = require('../contracts/validation');

function acquire(session, input) {
  assertPersistentScope(session);
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const ttlMs = Number(input.ttlMs);
  assertLeaseInput(input, ttlMs);
  const leases = activeLeases(session, now);
  const existing = leases.find((lease) => lease.leaseId === input.leaseId);
  const branchLease = leases.find((lease) => lease.branchId === input.branchId);
  assertNoConflict(branchLease, input);
  const lease = { leaseId: input.leaseId, branchId: input.branchId, ownerId: input.ownerId, expiresAt: new Date(now + ttlMs).toISOString() };
  session.leases = [...leases.filter((item) => item.leaseId !== input.leaseId), lease];
  return { lease, renewed: Boolean(existing) };
}

function assertPersistentScope(session) {
  if (session.variant === 'persistent' || session.scope === 'persistent') return;
  throw Object.assign(new Error('Branch leases require a persistent Rhizome session.'), { code: 'RHIZOME_LEASE_SCOPE_INVALID' });
}

function assertLeaseInput(input, ttlMs) {
  const invalidIdentity = !input.leaseId || !input.branchId || !input.ownerId;
  const invalidTtl = !Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 30 * 24 * 60 * 60 * 1000;
  if (invalidIdentity || invalidTtl) throw Object.assign(new Error('Branch leases require lease, branch, owner and positive TTL values.'), { code: 'RHIZOME_LEASE_INVALID' });
}

function assertNoConflict(branchLease, input) {
  if (!branchLease || (branchLease.ownerId === input.ownerId && branchLease.leaseId === input.leaseId)) return;
  throw Object.assign(new Error('Branch lease is held by a different lease or owner.'), { code: 'RHIZOME_LEASE_CONFLICT' });
}

function release(session, input) {
  const lease = (session.leases || []).find((item) => item.leaseId === input.leaseId);
  if (!lease) return { released: false, reason: 'LEASE_NOT_FOUND' };
  if (lease.ownerId !== input.ownerId) {
    throw Object.assign(new Error('Only the lease owner can release a branch lease.'), { code: 'RHIZOME_LEASE_OWNER_MISMATCH' });
  }
  session.leases = session.leases.filter((item) => item.leaseId !== input.leaseId);
  return { released: true, leaseId: input.leaseId };
}

function normalizeLease(value) {
  const lease = objectValue(value, 'BranchLease');
  return {
    leaseId: textValue(lease.leaseId, 'leaseId'),
    branchId: textValue(lease.branchId, 'branchId'),
    ownerId: textValue(lease.ownerId, 'ownerId'),
    expiresAt: isoDateOrNull(lease.expiresAt, 'expiresAt')
  };
}

function activeLeases(session, now = Date.now()) {
  const time = typeof now === 'number' ? now : Date.parse(now);
  return (session.leases || []).filter((lease) => Date.parse(lease.expiresAt) > time);
}

function expire(session, now = Date.now()) {
  const before = (session.leases || []).length;
  session.leases = activeLeases(session, now);
  return { expired: before - session.leases.length, active: session.leases.length };
}

module.exports = { acquire, release, activeLeases, expire, normalizeLease };
