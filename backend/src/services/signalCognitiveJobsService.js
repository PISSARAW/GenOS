'use strict';

const MAX_ATTEMPTS = 3;
const LEASE_MS = 300_000;

async function enqueueCognitiveJob(db, signal) {
  if (!signal?.signalId || signal.llmRequired !== true || !signal.scope?.organizationId || !signal.scope?.projectId) {
    throw new Error('A scoped cognitive signal is required.');
  }
  await db.run(
    `INSERT OR IGNORE INTO signal_cognitive_jobs (signal_id, organization_id, project_id, signal_json)
     VALUES (?, ?, ?, ?)`,
    signal.signalId, signal.scope.organizationId, signal.scope.projectId, JSON.stringify(signal)
  );
}

async function listReadyCognitiveJobs(db, now = Date.now()) {
  await db.run(
    `UPDATE signal_cognitive_jobs SET status = 'dead', lease_owner = NULL
     WHERE status = 'leased' AND lease_until_ms <= ? AND attempts >= ?`,
    now, MAX_ATTEMPTS
  );
  return db.all(
    `SELECT signal_id FROM signal_cognitive_jobs
     WHERE attempts < ? AND
       ((status = 'pending' AND next_attempt_at_ms <= ?)
        OR (status = 'leased' AND lease_until_ms <= ?))
     ORDER BY created_at LIMIT 20`,
    MAX_ATTEMPTS, now, now
  );
}

async function claimCognitiveJob(db, input) {
  const now = input.now ?? Date.now();
  const result = await db.run(
    `UPDATE signal_cognitive_jobs SET status = 'leased', lease_owner = ?,
       lease_until_ms = ?, attempts = attempts + 1
     WHERE signal_id = ? AND attempts < ?
       AND ((status = 'pending' AND next_attempt_at_ms <= ?)
        OR (status = 'leased' AND lease_until_ms <= ?))`,
    input.owner, now + LEASE_MS, input.signalId, MAX_ATTEMPTS, now, now
  );
  if (!result.changes) return null;
  const row = await db.get(
    'SELECT signal_json, attempts FROM signal_cognitive_jobs WHERE signal_id = ? AND lease_owner = ?',
    input.signalId, input.owner
  );
  return row ? { signal: JSON.parse(row.signal_json), attempts: row.attempts } : null;
}

async function completeCognitiveJob(db, input) {
  const result = await db.run(
    `UPDATE signal_cognitive_jobs SET status = 'completed', target_agent_id = ?,
       result_json = ?, completed_at = CURRENT_TIMESTAMP, lease_owner = NULL,
       lease_until_ms = 0, last_error = NULL
     WHERE signal_id = ? AND status = 'leased' AND lease_owner = ?`,
    input.targetAgentId, JSON.stringify(input.result),
    input.signalId, input.owner
  );
  return result.changes === 1;
}

async function failCognitiveJob(db, input) {
  const terminal = input.attempts >= MAX_ATTEMPTS;
  const nextAttempt = Date.now() + Math.min(60_000, 1000 * (2 ** input.attempts));
  const result = await db.run(
    `UPDATE signal_cognitive_jobs SET status = ?, lease_owner = NULL,
       lease_until_ms = 0, next_attempt_at_ms = ?, last_error = ?
     WHERE signal_id = ? AND status = 'leased' AND lease_owner = ?`,
    terminal ? 'dead' : 'pending', nextAttempt,
    String(input.error || 'Cognitive processing failed').slice(0, 1000),
    input.signalId, input.owner
  );
  return result.changes === 1;
}

async function listScopedCognitiveJobs(db, scope) {
  return db.all(
    `SELECT signal_id, status, attempts, target_agent_id, result_json, last_error,
       created_at, completed_at FROM signal_cognitive_jobs
     WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 100`,
    scope.organizationId, scope.projectId
  );
}

async function retryDeadCognitiveJob(db, scope, signalId) {
  const result = await db.run(
    `UPDATE signal_cognitive_jobs SET status = 'pending', attempts = 0,
       lease_owner = NULL, lease_until_ms = 0, next_attempt_at_ms = 0,
       last_error = NULL WHERE signal_id = ? AND organization_id = ?
       AND project_id = ? AND status = 'dead'`,
    signalId, scope.organizationId, scope.projectId
  );
  return result.changes === 1;
}

module.exports = {
  enqueueCognitiveJob, listReadyCognitiveJobs, claimCognitiveJob,
  completeCognitiveJob, failCognitiveJob, listScopedCognitiveJobs, retryDeadCognitiveJob
};
