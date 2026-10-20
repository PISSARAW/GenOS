'use strict';

/**
 * Test du sas d'orphelinat pour workers (ADR 0035).
 *
 * Couvre : admission au sas, réclamation avant TTL, rejet après TTL,
 * expiration automatique, idempotence de l'admission, détection isInOrphanage.
 */

const assert = require('node:assert/strict');

const state = require('../src/services/agentOrchestrationState');
const emitted = [];
state.emit = (...args) => { emitted.push(args); };
const orphanage = require('../src/services/daemon/reconciliation/orphanageService');

const T = 'territory.orphanage-test';

async function openDb() {
  const sqlite = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  return {
    run: (sql, ...args) => db.run(sql, ...args),
    get: (sql, ...args) => db.get(sql, ...args),
    all: (sql, ...args) => db.all(sql, ...args),
    exec: (sql) => db.exec(sql),
    close: () => db.close()
  };
}

async function setupAgentsTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      execution_mode TEXT NOT NULL DEFAULT 'worker',
      status TEXT NOT NULL DEFAULT 'running',
      current_budget INTEGER NOT NULL DEFAULT 100,
      parent_agent_id TEXT,
      territory_id TEXT,
      runtime_pid INTEGER,
      runtime_executable TEXT,
      runtime_started_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function insertWorker(db, id, overrides = {}) {
  await db.run(
    `INSERT INTO agents (id, execution_mode, status, current_budget, parent_agent_id, territory_id, updated_at)
     VALUES (?, 'worker', 'running', ?, NULL, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       execution_mode = excluded.execution_mode,
       status = excluded.status,
       current_budget = excluded.current_budget,
       parent_agent_id = excluded.parent_agent_id,
       territory_id = excluded.territory_id`,
    id,
    overrides.budget ?? 100,
    overrides.territoryId ?? T
  );
}

async function main() {
  const db = await openDb();
  await setupAgentsTable(db);

  // ---- 1. Admission au sas : budget gelé, statut SUSPECT, signal émis ----
  await insertWorker(db, 'w-admit', { budget: 50 });
  const adm = await orphanage.admitWorker(db, {
    workerId: 'w-admit',
    territoryId: T,
    formerParentId: 'p-dead',
    ttlMs: 5 * 60 * 1000
  });
  assert.equal(adm.admitted, true, 'admission should succeed');
  assert.equal(adm.budgetFrozenAt, 50, 'budget should be frozen at snapshot value');
  assert.equal(adm.graceExpiresAt.length > 0, true, 'grace expiry should be set');

  const grace = await db.get('SELECT status FROM worker_orphanage_grace WHERE worker_id = ?', 'w-admit');
  assert.equal(grace.status, 'SUSPECT', 'worker should be in SUSPECT status');

  const orphanSignal = emitted.find((e) => e[1] === 'WORKER_ORPHANED');
  assert.equal(orphanSignal && orphanSignal[0], 'w-admit', 'WORKER_ORPHANED signal should be emitted');

  // ---- 2. Réclamation avant TTL : réassigné, statut RECLAIMED ----
  const reclaimed = await orphanage.reclaimWorker(db, {
    workerId: 'w-admit',
    claimantId: 'p-new',
    proof: { compatible: true }
  });
  assert.equal(reclaimed.reclaimed, true, 'reclaim before TTL should succeed');
  assert.equal(reclaimed.claimantId, 'p-new');

  const agent = await db.get('SELECT parent_agent_id FROM agents WHERE id = ?', 'w-admit');
  assert.equal(agent.parent_agent_id, 'p-new', 'parent should be updated to claimant');

  const graceAfter = await db.get('SELECT status FROM worker_orphanage_grace WHERE worker_id = ?', 'w-admit');
  assert.equal(graceAfter.status, 'RECLAIMED', 'grace status should be RECLAIMED');

  const reclaimSignal = emitted.find((e) => e[1] === 'WORKER_RECLAIMED');
  assert.equal(reclaimSignal && reclaimSignal[0], 'w-admit', 'WORKER_RECLAIMED signal should be emitted');

  // ---- 3. Rejet après TTL : pas de réclamation possible ----
  await insertWorker(db, 'w-expired-claim', { budget: 80 });
  await db.run(
    `INSERT INTO worker_orphanage_grace (worker_id, territory_id, former_parent_id, grace_expires_at, budget_frozen_at, status)
     VALUES (?, ?, ?, '2000-01-01 00:00:00', 80, 'SUSPECT')`,
    'w-expired-claim', T, 'p-old'
  );
  const rejected = await orphanage.reclaimWorker(db, {
    workerId: 'w-expired-claim',
    claimantId: 'p-late',
    proof: {}
  });
  assert.equal(rejected.reclaimed, false, 'reclaim after TTL should be rejected');
  assert.equal(rejected.reason, 'ttl-expired', 'reason should be ttl-expired');
  await db.run('DELETE FROM worker_orphanage_grace WHERE worker_id = ?', 'w-expired-claim');

  // ---- 4. Expiration automatique : reapExpiredOrphans termine le worker ----
  await insertWorker(db, 'w-reap', { budget: 30 });
  await db.run(
    `INSERT INTO worker_orphanage_grace (worker_id, territory_id, former_parent_id, grace_expires_at, budget_frozen_at, status)
     VALUES (?, ?, ?, '2000-01-01 00:00:00', 30, 'SUSPECT')`,
    'w-reap', T, 'p-old'
  );
  const reaped = await orphanage.reapExpiredOrphans(db, new Date().toISOString());
  assert.equal(reaped.reaped, 1, 'one orphan should be reaped');

  const wReap = await db.get('SELECT status FROM agents WHERE id = ?', 'w-reap');
  assert.equal(wReap.status, 'terminated', 'worker should be terminated after TTL');

  const gReap = await db.get('SELECT status FROM worker_orphanage_grace WHERE worker_id = ?', 'w-reap');
  assert.equal(gReap.status, 'EXPIRED', 'grace status should be EXPIRED');

  const expirySignal = emitted.find((e) => e[1] === 'WORKER_ORPHANAGE_EXPIRED');
  assert.equal(expirySignal && expirySignal[0], 'w-reap', 'WORKER_ORPHANAGE_EXPIRED signal should be emitted');

  // ---- 5. Idempotence : admission double = une seule ligne, TSL réinitialisé ----
  await insertWorker(db, 'w-idem', { budget: 60 });
  const adm1 = await orphanage.admitWorker(db, {
    workerId: 'w-idem', territoryId: T, formerParentId: 'p1', ttlMs: 5 * 60 * 1000
  });
  const adm2 = await orphanage.admitWorker(db, {
    workerId: 'w-idem', territoryId: T, formerParentId: 'p1', ttlMs: 5 * 60 * 1000
  });
  assert.equal(adm1.admitted, true, 'first admission should succeed');
  assert.equal(adm2.admitted, true, 'second admission should not throw');
  const count = await db.get('SELECT COUNT(*) AS c FROM worker_orphanage_grace WHERE worker_id = ?', 'w-idem');
  assert.equal(count.c, 1, 'only one row should exist per worker');

  // ---- 6. isInOrphanage : détection ----
  await insertWorker(db, 'w-detect', { budget: 40 });
  await orphanage.admitWorker(db, {
    workerId: 'w-detect', territoryId: T, formerParentId: 'p1', ttlMs: 5 * 60 * 1000
  });
  const inOrph = await orphanage.isInOrphanage(db, 'w-detect');
  assert.equal(inOrph.inOrphanage, true, 'worker in orphanage should be detected');

  const notInOrph = await orphanage.isInOrphanage(db, 'w-unknown');
  assert.equal(notInOrph.inOrphanage, false, 'unknown worker should not be in orphanage');

  await db.close();
  console.log('Worker orphanage tests passed (admission, reclaim, ttl-reject, reap, idempotence, isInOrphanage).');
}

main().catch((error) => { console.error(error); process.exit(1); });
