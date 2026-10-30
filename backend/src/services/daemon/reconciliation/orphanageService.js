'use strict';

/**
 * Orphanage Service — sas d'orphelinat pour workers (ADR 0035).
 *
 * Un worker orphelin (parent mort/apoptotique, pas de runtime_pid,
 * pas de lease garage actif) est admis au sas avec son budget gelé
 * et un TTL impitoyable. Trois issues :
 * - réclamation par un nouveau parent avant TTL → RECLAIMED → ACTIVE
 * - expiration du TTL → EXPIRED → TERMINÉ
 * - jamais réclamé → le sweep du reconciler termine à l'expiration
 *
 * Seul le ResidentDaemon détient le lease d'admission, de réclamation
 * et de réapér. Pas de nouvel statut agents.status : le sas est la
 * source de vérité, pas une mutation de la ligne agent.
 */

const { migrateWorkerOrphanageGrace } = require('../../../db/migrations/migrateWorkerOrphanageGrace');
const { emit } = require('../../agentOrchestrationState');

const DEFAULT_ORPHAN_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function ensureSchema(db) {
  await migrateWorkerOrphanageGrace(db);
}

async function admitWorker(db, admission) {
  await ensureSchema(db);
  if (!admission?.territoryId) return { admitted: false, reason: 'territory-required' };
  const {
    workerId,
    territoryId,
    formerParentId,
    ttlMs = DEFAULT_ORPHAN_TTL_MS,
    nowIso = new Date().toISOString()
  } = admission;
  const worker = await db.get('SELECT cognitive_budget FROM agents WHERE id = ?', workerId);
  const budgetFrozenAt = worker ? Number(worker.cognitive_budget || 0) : 0;
  const graceExpiresAt = new Date(Date.now() + ttlMs).toISOString();

  await db.run(
    `INSERT INTO worker_orphanage_grace (worker_id, territory_id, former_parent_id, grace_expires_at, budget_frozen_at, status)
     VALUES (?, ?, ?, ?, ?, 'SUSPECT')
     ON CONFLICT(worker_id) DO UPDATE SET
       territory_id = excluded.territory_id,
       former_parent_id = excluded.former_parent_id,
       orphaned_at = datetime('now'),
       grace_expires_at = excluded.grace_expires_at,
       budget_frozen_at = excluded.budget_frozen_at,
       status = 'SUSPECT',
       reclaim_proof = NULL,
       reclaimed_by = NULL`,
    workerId, territoryId, formerParentId, graceExpiresAt, budgetFrozenAt
  );

  emit(workerId, 'WORKER_ORPHANED', 'RECONCILE',
    `Worker ${workerId} entered orphanage; budget frozen at ${budgetFrozenAt}; expires at ${graceExpiresAt}`,
    { territoryId, formerParentId, graceExpiresAt }, 'warning');

  return { admitted: true, workerId, graceExpiresAt, budgetFrozenAt };
}

async function reclaimWorker(db, claim) {
  await ensureSchema(db);
  const { workerId, claimantId, proof } = claim;
  const grace = await db.get(
    'SELECT * FROM worker_orphanage_grace WHERE worker_id = ? AND status = ?',
    workerId, 'SUSPECT'
  );
  if (!grace) return { reclaimed: false, reason: 'not-in-orphanage' };
  if (Date.now() > Date.parse(grace.grace_expires_at)) return { reclaimed: false, reason: 'ttl-expired' };

  await db.run(
    `UPDATE worker_orphanage_grace SET status = 'RECLAIMED', reclaimed_by = ?, reclaim_proof = ? WHERE worker_id = ?`,
    claimantId, JSON.stringify(proof || {}), workerId
  );
  await db.run(
    `UPDATE agents SET parent_agent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    claimantId, workerId
  );
  emit(workerId, 'WORKER_RECLAIMED', 'RECONCILE',
    `Worker ${workerId} reclaimed by ${claimantId}`, { claimantId }, 'info');

  return { reclaimed: true, workerId, claimantId };
}

async function reapExpiredOrphans(db, nowIso) {
  await ensureSchema(db);
  const expired = await db.all(
    `SELECT worker_id FROM worker_orphanage_grace WHERE status = 'SUSPECT' AND datetime(grace_expires_at) <= datetime(?)`,
    nowIso
  );
  let reaped = 0;
  for (const { worker_id } of expired) {
    await db.run(`UPDATE worker_orphanage_grace SET status = 'EXPIRED' WHERE worker_id = ?`, worker_id);
    await db.run(`UPDATE agents SET status = 'terminated', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, worker_id);
    emit(worker_id, 'WORKER_ORPHANAGE_EXPIRED', 'RECONCILE',
      `Worker ${worker_id} terminated after orphanage TTL`, {}, 'warning');
    reaped += 1;
  }
  return { reaped };
}

async function isInOrphanage(db, workerId) {
  await ensureSchema(db);
  const row = await db.get(
    'SELECT status FROM worker_orphanage_grace WHERE worker_id = ? AND status = ?',
    workerId, 'SUSPECT'
  );
  return { inOrphanage: !!row };
}

module.exports = {
  admitWorker,
  reclaimWorker,
  reapExpiredOrphans,
  isInOrphanage,
  DEFAULT_ORPHAN_TTL_MS
};
