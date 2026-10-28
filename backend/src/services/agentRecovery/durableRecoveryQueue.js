'use strict';

const { randomUUID } = require('node:crypto');
const { getDatabase } = require('../../db');
const MAX_RECOVERY_DISPATCH_ATTEMPTS = require('./constants').MAX_RECOVERY_DISPATCH_ATTEMPTS;

function stripCredentials(value) {
  if (Array.isArray(value)) return value.map(stripCredentials);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(token|secret|password|credential|authorization|toolLease|lease)/i.test(key))
    .map(([key, entry]) => [key, stripCredentials(entry)]));
}

async function enqueue(input) {
  const { workerId, mission, report, decision, key } = input;
  const db = await getDatabase();
  await require('../../db/migrations/migrateWorkerRecoveryQueue').migrateWorkerRecoveryQueue(db);
  const payload = JSON.stringify(stripCredentials({ mission, report, decision }));
  await db.run(`UPDATE worker_recovery_queue SET status='cancelled', claim_token=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE worker_id=? AND recovery_key<>? AND status IN ('queued','retry')
      AND json_extract(payload_json,'$.report.attempt') <= ?`, workerId, key, Number(report.attempt || 0));
  await db.run(`INSERT OR IGNORE INTO worker_recovery_queue
    (recovery_key, worker_id, mission_id, payload_json, status, max_attempts)
    VALUES (?, ?, ?, ?, 'queued', ?)`, key, workerId, mission.missionId || mission.id || workerId,
  payload, MAX_RECOVERY_DISPATCH_ATTEMPTS);
  await db.run(`UPDATE worker_recovery_queue SET payload_json=?, status='queued', updated_at=CURRENT_TIMESTAMP
    WHERE recovery_key=? AND status IN ('queued','retry') AND json_extract(payload_json,'$.report.attempt') < ?`,
  payload, key, Number(report.attempt || 0));
}

async function claim(workerId) {
  const db = await getDatabase();
  const row = await db.get(`SELECT * FROM worker_recovery_queue WHERE worker_id=?
    AND status IN ('queued','retry') ORDER BY updated_at DESC, created_at DESC LIMIT 1`, workerId);
  if (!row) return null;
  const claimToken = randomUUID();
  const result = await db.run(`UPDATE worker_recovery_queue SET status='claimed', claim_token=?, attempts=attempts+1,
    claim_owner_pid=?, claim_expires_at=datetime('now','+2 minutes'),
    updated_at=CURRENT_TIMESTAMP WHERE recovery_key=? AND status IN ('queued','retry')`,
  claimToken, process.pid, row.recovery_key);
  if (result.changes !== 1) return null;
  return { ...row, claim_token: claimToken, attempts: Number(row.attempts) + 1, payload: JSON.parse(row.payload_json) };
}

async function finish(item, status) {
  if (!item) return;
  const db = await getDatabase();
  await db.run(`UPDATE worker_recovery_queue SET status=?, claim_token=NULL, claim_expires_at=NULL,
    claim_owner_pid=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE recovery_key=? AND status='claimed' AND claim_token=?`, status, item.recovery_key, item.claim_token);
}

async function cancel(workerId) {
  const db = await getDatabase();
  await db.run(`UPDATE worker_recovery_queue SET status='cancelled', claim_token=NULL,
    claim_expires_at=NULL, claim_owner_pid=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE worker_id=? AND status IN ('queued','retry','claimed')`, workerId);
}

async function renew(item) {
  if (!item) return true;
  const db = await getDatabase();
  const result = await db.run(`UPDATE worker_recovery_queue SET claim_expires_at=datetime('now','+2 minutes'),
    updated_at=CURRENT_TIMESTAMP WHERE recovery_key=? AND status='claimed' AND claim_token=?`,
  item.recovery_key, item.claim_token);
  return result.changes === 1;
}

async function recoverAbandonedClaims(dbHandle) {
  const db = dbHandle || await getDatabase();
  await require('../../db/migrations/migrateWorkerRecoveryQueue').migrateWorkerRecoveryQueue(db);
  await db.run(`UPDATE worker_recovery_queue SET status='retry', claim_token=NULL,
    claim_expires_at=NULL, claim_owner_pid=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE status='claimed' AND ((claim_expires_at IS NOT NULL AND claim_expires_at <= CURRENT_TIMESTAMP)
      OR (claim_expires_at IS NULL AND updated_at <= datetime('now','-5 minutes')))
      AND attempts < max_attempts`);
  await db.run(`UPDATE worker_recovery_queue SET status='exhausted', claim_token=NULL,
    claim_expires_at=NULL, claim_owner_pid=NULL, updated_at=CURRENT_TIMESTAMP
    WHERE status='claimed' AND ((claim_expires_at IS NOT NULL AND claim_expires_at <= CURRENT_TIMESTAMP)
      OR (claim_expires_at IS NULL AND updated_at <= datetime('now','-5 minutes')))
      AND attempts >= max_attempts`);
  return db.all(`SELECT DISTINCT worker_id FROM worker_recovery_queue
    WHERE status IN ('queued','retry') ORDER BY updated_at`);
}

async function isClaimActive(item) {
  if (!item) return true;
  const db = await getDatabase();
  const row = await db.get(`SELECT 1 AS active FROM worker_recovery_queue
    WHERE recovery_key=? AND status='claimed' AND claim_token=?`, item.recovery_key, item.claim_token);
  return Boolean(row);
}

module.exports = { enqueue, claim, finish, cancel, isClaimActive, renew, recoverAbandonedClaims, stripCredentials };
