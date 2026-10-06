'use strict';

const { randomUUID } = require('node:crypto');
const initialized = new WeakSet();
const TTL = 120000;

async function initialize(db) {
  if (initialized.has(db)) return;
  await require('../db/migrations/migrateGvxRuntime').migrateGvxRuntime(db);
  initialized.add(db);
}

async function acquire(db, lane) {
  await initialize(db);
  const owner = randomUUID();
  const now = Date.now();
  const result = await db.run(`INSERT INTO gvx_runtime_leases (lane, owner, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(lane) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
    WHERE gvx_runtime_leases.expires_at <= ?`, lane, owner, now + TTL, now);
  if (result.changes !== 1) return null;
  return { db, lane, owner, lost: false };
}

async function renew(lease) {
  const now = Date.now();
  const result = await lease.db.run(`UPDATE gvx_runtime_leases SET expires_at = ?
    WHERE lane = ? AND owner = ? AND expires_at > ?`, now + TTL, lease.lane, lease.owner, now);
  if (result.changes !== 1) lease.lost = true;
}

async function assertOwned(lease) {
  if (lease.lost) throw leaseError();
  const row = await lease.db.get('SELECT owner, expires_at FROM gvx_runtime_leases WHERE lane = ?', lease.lane);
  if (!row || row.owner !== lease.owner || row.expires_at <= Date.now()) throw leaseError();
}

async function release(lease) {
  await lease.db.run('DELETE FROM gvx_runtime_leases WHERE lane = ? AND owner = ?', lease.lane, lease.owner);
}

async function withLease(options, run) {
  const lease = await acquire(options.db, options.lane);
  if (!lease) return { status: 'deferred', reason: 'gvx-cycle-running', promotionAllowed: false };
  const timer = setInterval(() => renew(lease).catch(() => { lease.lost = true; }), TTL / 4);
  timer.unref();
  try { return await run(lease); }
  finally { clearInterval(timer); await release(lease); }
}

function leaseError() { return Object.assign(new Error('GVX runtime lease lost.'), { code: 'GVX_LEASE_LOST' }); }

module.exports = { initialize, acquire, renew, assertOwned, release, withLease };
