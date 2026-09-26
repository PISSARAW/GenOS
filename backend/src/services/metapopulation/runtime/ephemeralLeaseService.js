'use strict';
const { randomUUID } = require('crypto');

const leases = new Map();

async function persistLeaseToDb(context) {
  const { db, metapopulationId, patchId, ttlMs } = context;
  const leaseId = `lease-${patchId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await db.run(`INSERT OR REPLACE INTO ephemeral_leases (lease_id, metapopulation_id, patch_id, ttl_ms, created_at, expires_at, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)`, [leaseId, metapopulationId, patchId, ttlMs, createdAt, expiresAt]);
  return { leaseId, patchId, ttlMs, expiresAt, active: true };
}

async function loadLeaseFromDb(context) {
  const { db, metapopulationId, patchId } = context;
  const row = await db.get(`SELECT lease_id, ttl_ms, expires_at, active FROM ephemeral_leases
    WHERE metapopulation_id = ? AND patch_id = ? AND active = 1 ORDER BY expires_at DESC LIMIT 1`,
    [metapopulationId, patchId]);
  if (!row) return null;
  const expiresAt = new Date(row.expires_at).getTime();
  return { leaseId: row.lease_id, patchId, ttlMs: row.ttl_ms, expiresAt, active: Boolean(row.active) };
}

async function detectExpiredLeases(db, metapopulationId, options) {
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const rows = await db.all(`SELECT lease_id, patch_id, expires_at FROM ephemeral_leases
    WHERE metapopulation_id = ? AND active = 1 AND expires_at < ?`,
    [metapopulationId, new Date(now).toISOString()]);
  return rows.map((r) => ({ leaseId: r.lease_id, patchId: r.patch_id, expiredAt: new Date(r.expires_at).getTime(), active: false }));
}

async function deactivateExpiredLease(context) {
  const { db, leaseId } = context;
  await db.run(`UPDATE ephemeral_leases SET active = 0 WHERE lease_id = ?`, [leaseId]);
}

async function createEphemeralLease(context) {
  const { db, metapopulationId, patchId, ttlMs } = context;
  const existing = await loadLeaseFromDb({ db, metapopulationId, patchId });
  if (existing && existing.expiresAt > Date.now()) {
    return { leaseId: existing.leaseId, patchId, renewed: false, expiresAt: existing.expiresAt };
  }
  const lease = await persistLeaseToDb({ db, metapopulationId, patchId, ttlMs: ttlMs || 300000 });
  return { leaseId: lease.leaseId, patchId, renewed: !existing, expiresAt: new Date(lease.expiresAt).getTime() };
}

async function extendEphemeralLease(context) {
  const { db, metapopulationId, patchId, ttlMs } = context;
  const existing = await loadLeaseFromDb({ db, metapopulationId, patchId });
  if (!existing) {
    return createEphemeralLease({ db, metapopulationId, patchId, ttlMs });
  }
  const newExpiresAt = new Date(Date.now() + (ttlMs || 300000)).toISOString();
  await db.run(`UPDATE ephemeral_leases SET expires_at = ?, active = 1 WHERE lease_id = ?`,
    [newExpiresAt, existing.leaseId]);
  return { leaseId: existing.leaseId, patchId, renewed: true, expiresAt: new Date(newExpiresAt).getTime() };
}

function inMemoryLease(patchId, ttlMs) {
  const leaseId = `lease-${patchId}-${Date.now()}`;
  const expiresAt = Date.now() + ttlMs;
  leases.set(patchId, { leaseId, patchId, ttlMs, expiresAt, active: true });
  return leases.get(patchId);
}

function checkInMemoryLease(patchId) {
  const lease = leases.get(patchId);
  if (!lease || !lease.active) return null;
  if (Date.now() > lease.expiresAt) {
    lease.active = false;
    return null;
  }
  return lease;
}

module.exports = {
  createEphemeralLease,
  extendEphemeralLease,
  loadLeaseFromDb,
  detectExpiredLeases,
  deactivateExpiredLease,
  inMemoryLease,
  checkInMemoryLease,
};
