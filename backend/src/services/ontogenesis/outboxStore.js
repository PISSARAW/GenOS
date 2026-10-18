'use strict';

const crypto = require('crypto');
const { canonicalJson, digest } = require('./durableJson');

async function enqueue(db, input) {
  const payloadHash = digest(input.payload);
  const existing = await db.get(`SELECT * FROM ontogenesis_outbox
    WHERE project_id = ? AND dedupe_key = ?`, [input.projectId, input.dedupeKey]);
  if (existing) {
    if (existing.payload_hash !== payloadHash || existing.channel !== input.channel
      || existing.kind !== input.kind) throw new Error('outbox-idempotence-conflit');
    return existing;
  }
  const id = input.id || `onto_out_${crypto.randomUUID()}`;
  await db.run(`INSERT INTO ontogenesis_outbox
    (id, project_id, operation_id, channel, kind, dedupe_key, payload_json, payload_hash, available_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
  [id, input.projectId, input.operationId || null, input.channel, input.kind, input.dedupeKey,
    canonicalJson(input.payload), payloadHash, input.availableAt || null]);
  return db.get('SELECT * FROM ontogenesis_outbox WHERE id = ?', [id]);
}

async function listDeliverable(db, projectId) {
  return db.all(`SELECT * FROM ontogenesis_outbox WHERE project_id = ? AND state = 'pending'
    AND datetime(available_at) <= datetime('now') ORDER BY created_at, id`, [projectId]);
}

module.exports = { enqueue, listDeliverable };
