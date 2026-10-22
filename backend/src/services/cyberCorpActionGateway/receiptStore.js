'use strict';

const crypto = require('node:crypto');
const { getDatabase } = require('../../db');

async function reserve(input) {
  const db = await getDatabase();
  await db.run(`CREATE TABLE IF NOT EXISTS cybercorp_action_receipts (
    scope TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
    status TEXT NOT NULL, response_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(scope, idempotency_key)
  )`);
  const result = await db.run(`INSERT OR IGNORE INTO cybercorp_action_receipts
    (scope, idempotency_key, request_hash, status) VALUES (?, ?, ?, 'reserved')`,
  input.scope, input.key, fingerprint(input.request));
  if (result?.changes === 1) return { claimed: true };
  const prior = await db.get('SELECT request_hash, status, response_json FROM cybercorp_action_receipts WHERE scope = ? AND idempotency_key = ?', input.scope, input.key);
  if (!prior || prior.request_hash !== fingerprint(input.request)) return { claimed: false, code: 'IDEMPOTENCY_CONFLICT' };
  if (prior.status !== 'complete') return { claimed: false, code: 'OUTCOME_UNCERTAIN' };
  return { claimed: false, replay: JSON.parse(prior.response_json) };
}

async function complete(input) {
  const db = await getDatabase();
  const saved = await db.run(`UPDATE cybercorp_action_receipts SET status = 'complete', response_json = ?
    WHERE scope = ? AND idempotency_key = ? AND request_hash = ? AND status = 'reserved'`,
  JSON.stringify(input.response), input.scope, input.key, fingerprint(input.request));
  if (saved?.changes !== 1) throw new Error('Action receipt reservation was lost.');
}

async function release(input) {
  const db = await getDatabase();
  await db.run(`DELETE FROM cybercorp_action_receipts WHERE scope = ? AND idempotency_key = ?
    AND request_hash = ? AND status = 'reserved'`, input.scope, input.key, fingerprint(input.request));
}

function fingerprint(request) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

module.exports = { complete, release, reserve };
