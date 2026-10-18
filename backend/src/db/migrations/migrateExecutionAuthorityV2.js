'use strict';

const STATUSES = Object.freeze({
  pending: 'pending',
  bound: 'bound_v2',
  legacy: 'legacy_read_only'
});

async function ensureTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS execution_authority_bindings (
    run_id TEXT PRIMARY KEY,
    schema_version TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending','bound_v2','legacy_read_only')),
    envelope_hash TEXT,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
}

async function hasRunTable(db) {
  return Boolean(await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_execution_runs'"));
}

async function migrateExecutionAuthorityV2(db) {
  await ensureTable(db);
  if (!await hasRunTable(db)) return;
  await db.run(`INSERT OR IGNORE INTO execution_authority_bindings
    (run_id, schema_version, status, reason)
    SELECT id, 'unversioned', 'legacy_read_only', 'no-v2-envelope-at-migration'
    FROM strategy_execution_runs`);
}

async function registerRun(db, runId, authorityRequired = true) {
  await ensureTable(db);
  const result = await db.run(`INSERT OR IGNORE INTO execution_authority_bindings
    (run_id, schema_version, status, reason) VALUES (?, ?, 'pending', ?)`,
  runId, 'genos.execution-authority-envelope/v2',
  authorityRequired ? 'awaiting-v2-seal' : 'internal-only');
  if (result.changes !== 1) {
    throw failure('EXECUTION_AUTHORITY_RUN_ALREADY_CLASSIFIED');
  }
}

async function isInternalRun(db, runId) {
  const current = await classification(db, runId);
  return current?.status === STATUSES.pending && current.reason === 'internal-only';
}

async function bindV2(db, input) {
  await ensureTable(db);
  const result = await db.run(`UPDATE execution_authority_bindings
    SET status = 'bound_v2', schema_version = ?, envelope_hash = ?, reason = NULL,
      updated_at = datetime('now')
    WHERE run_id = ? AND status = 'pending'`, input.schema, input.hash, input.runId);
  if (result.changes === 1) return;
  const current = await classification(db, input.runId);
  if (current?.status === STATUSES.bound && current.envelopeHash === input.hash) return;
  throw failure(current?.status === STATUSES.legacy
    ? 'EXECUTION_AUTHORITY_LEGACY_READ_ONLY'
    : 'EXECUTION_AUTHORITY_BINDING_STATE_INVALID');
}

async function classification(db, runId) {
  await ensureTable(db);
  const row = await db.get(`SELECT run_id AS runId, schema_version AS schema,
    status, envelope_hash AS envelopeHash, reason
    FROM execution_authority_bindings WHERE run_id = ?`, runId);
  if (row) return row;
  if (!await hasRunTable(db)) return null;
  const run = await db.get('SELECT id FROM strategy_execution_runs WHERE id = ?', runId);
  return run ? { runId, schema: 'unversioned', status: STATUSES.legacy,
    envelopeHash: null, reason: 'unclassified-historic-run' } : null;
}

function failure(code) {
  return Object.assign(new Error(code), { code });
}

module.exports = { STATUSES, migrateExecutionAuthorityV2, registerRun, bindV2, classification,
  isInternalRun };
