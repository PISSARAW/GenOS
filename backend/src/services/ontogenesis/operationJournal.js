'use strict';

const crypto = require('crypto');
const { canonicalJson, digest } = require('./durableJson');

const TRANSITIONS = {
  prepared: ['started', 'failed', 'escalated'],
  started: ['prepared', 'effect_applied', 'failed', 'escalated'],
  effect_applied: ['verified', 'completed', 'compensated', 'escalated'],
  verified: ['committed', 'failed', 'escalated'],
  committed: ['completed', 'escalated'],
  failed: ['prepared', 'completed', 'compensated', 'escalated'],
  compensated: ['completed', 'escalated'],
  completed: [], escalated: []
};

async function prepareOperation(db, input) {
  const intentHash = digest(input.intent);
  const existing = await db.get(`SELECT * FROM ontogenesis_operations
    WHERE project_id = ? AND idempotency_key = ?`, [input.projectId, input.idempotencyKey]);
  if (existing) {
    if (existing.intent_hash !== intentHash || existing.kind !== input.kind) {
      throw new Error('operation-idempotence-conflit');
    }
    return existing;
  }
  const id = input.id || `onto_op_${crypto.randomUUID()}`;
  await db.run(`INSERT INTO ontogenesis_operations
    (id, project_id, kind, idempotency_key, intent_hash, intent_json)
    VALUES (?, ?, ?, ?, ?, ?)`, [id, input.projectId, input.kind, input.idempotencyKey,
    intentHash, canonicalJson(input.intent)]);
  return getOperation(db, id);
}

async function getOperation(db, operationId) {
  return db.get('SELECT * FROM ontogenesis_operations WHERE id = ?', [operationId]);
}

async function transitionOperation(db, input) {
  const current = await getOperation(db, input.operationId);
  if (!current) throw new Error('operation-introuvable');
  if (!TRANSITIONS[current.state].includes(input.state)) throw new Error('transition-operation-invalide');
  const info = await db.run(`UPDATE ontogenesis_operations SET state = ?, result_json = ?,
    failure_json = ?, updated_at = datetime('now') WHERE id = ? AND state = ?`,
  [input.state, canonicalJson(input.result), canonicalJson(input.failure), current.id, current.state]);
  if (info.changes !== 1) throw new Error('operation-modifiee-concurremment');
  return getOperation(db, current.id);
}

async function listIncompleteOperations(db, projectId) {
  return db.all(`SELECT * FROM ontogenesis_operations WHERE project_id = ?
    AND state NOT IN ('completed','escalated') ORDER BY created_at, id`, [projectId]);
}

async function claimForRecovery(db, input) {
  const expiresAt = new Date(Date.now() + input.ttlMs).toISOString();
  const info = await db.run(`UPDATE ontogenesis_operations SET recovery_owner = ?,
    recovery_expires_at = ?, recovery_attempt = recovery_attempt + 1, updated_at = datetime('now')
    WHERE id = ? AND state NOT IN ('completed','escalated') AND
      (recovery_owner IS NULL OR recovery_owner = ? OR datetime(recovery_expires_at) <= datetime('now'))`,
  [input.owner, expiresAt, input.operationId, input.owner]);
  return info.changes === 1;
}

async function releaseRecoveryClaim(db, input) {
  await db.run(`UPDATE ontogenesis_operations SET recovery_owner = NULL, recovery_expires_at = NULL,
    updated_at = datetime('now') WHERE id = ? AND recovery_owner = ?`, [input.operationId, input.owner]);
}

module.exports = { TRANSITIONS, prepareOperation, getOperation, transitionOperation,
  listIncompleteOperations, claimForRecovery, releaseRecoveryClaim };
