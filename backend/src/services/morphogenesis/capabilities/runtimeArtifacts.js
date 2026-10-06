'use strict';

const { createHash } = require('crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

async function put(db, input) {
  if (!input.scopeId || !input.kind || input.content === undefined) throw new Error('ARTIFACT_CONTRACT_REQUIRED');
  const hash = digest({ scopeId: input.scopeId, kind: input.kind, content: input.content });
  const ref = `morph:sha256:${hash}`;
  await db.run(`INSERT OR IGNORE INTO morph_capability_artifacts
    (artifact_ref, scope_id, kind, content_json, digest, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  [ref, input.scopeId, input.kind, JSON.stringify(input.content), hash, new Date().toISOString()]);
  return ref;
}

async function get(db, input) {
  const row = await db.get('SELECT * FROM morph_capability_artifacts WHERE artifact_ref = ? AND scope_id = ?',
    [input.ref, input.scopeId]);
  if (!row) return null;
  const content = JSON.parse(row.content_json);
  if (digest({ scopeId: row.scope_id, kind: row.kind, content }) !== row.digest) return null;
  return { ref: row.artifact_ref, kind: row.kind, content, createdAt: row.created_at };
}

function resolver(db, scopeId) {
  return async (ref) => get(db, { ref, scopeId });
}

module.exports = { canonical, digest, put, get, resolver };
