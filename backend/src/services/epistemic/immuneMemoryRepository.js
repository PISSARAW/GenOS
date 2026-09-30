'use strict';

const MEMORY_LIMIT = 1000;

async function load(db, limit = MEMORY_LIMIT) {
  const rows = await db.all(
    'SELECT * FROM epistemic_immune_memory ORDER BY affinity DESC, updated_at DESC LIMIT ?',
    Math.min(Math.max(Number(limit) || MEMORY_LIMIT, 1), MEMORY_LIMIT),
  );
  return rows.map(hydrateEntry);
}

function hydrateEntry(row) {
  return {
    id: row.signature,
    signature: row.signature,
    pattern: parseJson(row.pattern_json, row.pattern_json),
    domain: row.domain,
    evidence: parseJson(row.evidence_json, null),
    effectiveResponse: parseJson(row.effective_response_json, null),
    affinity: row.affinity,
    failures: row.failures,
    successes: row.successes,
    pending: Boolean(row.pending),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJson(value, fallback) {
  try { return value === null ? fallback : JSON.parse(value); } catch (_) { return fallback; }
}

async function save(db, entries) {
  for (const entry of entries.slice(-MEMORY_LIMIT)) await saveEntry(db, entry);
}

async function saveEntry(db, entry) {
  await db.run(
    `INSERT INTO epistemic_immune_memory
      (signature, pattern_json, domain, evidence_json, effective_response_json, affinity,
       failures, successes, pending, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(signature) DO UPDATE SET pattern_json=excluded.pattern_json,
       domain=excluded.domain, evidence_json=excluded.evidence_json,
       effective_response_json=excluded.effective_response_json, affinity=excluded.affinity,
       failures=excluded.failures, successes=excluded.successes, pending=excluded.pending,
       updated_at=excluded.updated_at`,
    entry.signature, JSON.stringify(entry.pattern), entry.domain || 'general',
    jsonOrNull(entry.evidence), jsonOrNull(entry.effectiveResponse), entry.affinity,
    entry.failures, entry.successes, entry.pending ? 1 : 0, entry.createdAt, entry.updatedAt,
  );
}

function jsonOrNull(value) { return value == null ? null : JSON.stringify(value); }

module.exports = { load, save, MEMORY_LIMIT };
