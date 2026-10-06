'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const files = require('../cartography/territoryFiles');

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function ensureStore(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS provenance_records (
    id TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
}

function sourceHash(territory, scope) {
  if (!files.safeFile(territory.rootPath, scope.value, territory.scopePath)) return null;
  try {
    const absolute = path.join(territory.rootPath, scope.value);
    if (fs.statSync(absolute).size > 200 * 1024) return null;
    return digest(fs.readFileSync(absolute));
  } catch (_) { return null; }
}

async function record(db, observation) {
  await ensureStore(db);
  const payload = JSON.stringify({ apiVersion: 'genos.daemon-observation/v1',
    observedAt: new Date().toISOString(), ...observation });
  const payloadHash = digest(payload);
  const id = `daemon-observation-${payloadHash}`;
  await db.run(`INSERT INTO provenance_records (id, subject_type, subject_id, payload_hash, payload_json)
    VALUES (?, 'daemon_observation', ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
  id, observation.findingId, payloadHash, payload);
  return id;
}

module.exports = { record, ensureStore, sourceHash };
