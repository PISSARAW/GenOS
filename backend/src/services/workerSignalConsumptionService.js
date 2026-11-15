'use strict';

const crypto = require('node:crypto');
const { getDatabase } = require('../db');

async function ensureTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS worker_signal_observations (
    signal_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    semantic_type TEXT NOT NULL,
    locus TEXT,
    payload_digest TEXT NOT NULL,
    observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(signal_id, agent_id)
  )`);
}

function decodedOf(signal) {
  const decoded = signal?.signalData;
  return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : {};
}

function semanticTypeOf(signal, decoded) {
  return String(decoded.semanticType || decoded.payload?.semanticType
    || decoded.content?.semanticType || decoded.type || signal.signalType);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digestOf(decoded) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(decoded)).digest('hex')}`;
}

async function consume(workerId, signal, suppliedDb = null) {
  if (!workerId || !signal?.signalId || signal.llmRequired === true) {
    return { acted: false, reason: 'DETERMINISTIC_SIGNAL_REQUIRED' };
  }
  const db = suppliedDb || await getDatabase();
  await ensureTable(db);
  const decoded = decodedOf(signal);
  const result = await db.run(`INSERT OR IGNORE INTO worker_signal_observations
    (signal_id, agent_id, signal_type, semantic_type, locus, payload_digest)
    VALUES (?, ?, ?, ?, ?, ?)`, signal.signalId, workerId, signal.signalType,
  semanticTypeOf(signal, decoded), decoded.locus || signal.topic || null, digestOf(decoded));
  return { acted: result.changes === 1, action: 'signal_observed',
    alreadyObserved: result.changes !== 1, workerId, signalId: signal.signalId };
}

async function observations(db, agentId, limit = 20) {
  await ensureTable(db);
  return db.all(`SELECT signal_id AS signalId, signal_type AS signalType,
      semantic_type AS semanticType, locus, payload_digest AS payloadDigest,
      observed_at AS observedAt
    FROM worker_signal_observations WHERE agent_id = ?
    ORDER BY observed_at DESC LIMIT ?`, agentId, Math.max(1, Math.min(100, limit)));
}

module.exports = { consume, observations };
