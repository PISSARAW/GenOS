'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../../db');

async function acquire(input) {
  const lease = { ...input, token: randomUUID(), ttlMs: Math.max(60000, input.timeoutMs || 300000) + 60000 };
  await withTransaction(input.db, async () => {
    await input.db.exec(`CREATE TABLE IF NOT EXISTS biocenose_runtime_leases (
      community_id TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
    const now = Date.now();
    const saved = await input.db.run(`INSERT INTO biocenose_runtime_leases VALUES (?, ?, ?)
      ON CONFLICT(community_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
      WHERE biocenose_runtime_leases.expires_at <= ?`, input.communityId, lease.token, now + lease.ttlMs, now);
    if (saved.changes !== 1) throw leaseError();
  });
  return lease;
}

async function renew(lease) {
  const saved = await lease.db.run(`UPDATE biocenose_runtime_leases SET expires_at = ?
    WHERE community_id = ? AND token = ?`, Date.now() + lease.ttlMs, lease.communityId, lease.token);
  if (saved.changes !== 1) throw leaseError();
}

async function release(lease) {
  await lease.db.run('DELETE FROM biocenose_runtime_leases WHERE community_id = ? AND token = ?',
    lease.communityId, lease.token);
}

function leaseError() {
  return Object.assign(new Error('Biocenose community is already running or its execution lease was lost.'), {
    code: 'BIOCENOSE_RUNTIME_LEASE_CONFLICT'
  });
}

module.exports = { acquire, renew, release };
