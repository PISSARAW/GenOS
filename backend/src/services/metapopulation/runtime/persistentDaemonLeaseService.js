'use strict';
const { randomUUID } = require('crypto');

async function createDaemonLease(context) {
  const { db, metapopulationId, demeId, ttlMs } = context;
  return createDaemonLeaseRecord({ db, metapopulationId, demeId, ttlMs: ttlMs || 600000 });
}

async function createDaemonLeaseRecord(context) {
  const { db, metapopulationId, demeId, ttlMs } = context;
  const leaseId = `daemon-lease-${demeId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await db.run(
    `INSERT OR REPLACE INTO daemon_leases (lease_id, metapopulation_id, deme_id, ttl_ms, created_at, expires_at, active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [leaseId, metapopulationId, demeId, ttlMs, createdAt, expiresAt, createdAt]
  );
  return { leaseId, demeId, ttlMs, createdAt, expiresAt, active: true };
}

async function loadDaemonLease(db, metapopulationId, demeId) {
  const row = await db.get(
    `SELECT lease_id, deme_id, ttl_ms, created_at, expires_at, active FROM daemon_leases
     WHERE metapopulation_id = ? AND deme_id = ? AND active = 1
     ORDER BY expires_at DESC LIMIT 1`,
    [metapopulationId, demeId]
  );
  if (!row) return null;
  return {
    leaseId: row.lease_id,
    demeId: row.deme_id,
    ttlMs: row.ttl_ms,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    active: Boolean(row.active),
  };
}

async function extendDaemonLease(context) {
  const { db, metapopulationId, demeId, ttlMs } = context;
  const duration = ttlMs || 600000;
  const existing = await loadDaemonLease(db, metapopulationId, demeId);
  const now = Date.now();
  const newExpiresAt = new Date(now + duration).toISOString();
  if (existing) {
    await db.run(
      `UPDATE daemon_leases SET expires_at = ?, active = 1, updated_at = ? WHERE lease_id = ?`,
      [newExpiresAt, new Date().toISOString(), existing.leaseId]
    );
    return { leaseId: existing.leaseId, demeId, ttlMs: duration, expiresAt: now + duration, active: true };
  }
  return createDaemonLease({ db, metapopulationId, demeId, ttlMs: duration });
}

async function deactivateDaemonLease(db, metapopulationId, demeId) {
  await db.run(
    `UPDATE daemon_leases SET active = 0, updated_at = ? WHERE metapopulation_id = ? AND deme_id = ? AND active = 1`,
    [new Date().toISOString(), metapopulationId, demeId]
  );
}

async function pruneExpiredDaemonLeases(db, metapopulationId) {
  await db.run(
    `UPDATE daemon_leases SET active = 0, updated_at = ? WHERE metapopulation_id = ? AND expires_at < ?`,
    [new Date().toISOString(), metapopulationId, new Date().toISOString()]
  );
}

module.exports = {
  createDaemonLease,
  loadDaemonLease,
  extendDaemonLease,
  deactivateDaemonLease,
  pruneExpiredDaemonLeases,
};
