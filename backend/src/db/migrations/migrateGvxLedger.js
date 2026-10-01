'use strict';

const integrity = require('../../services/gvxLedgerIntegrity');

async function migrateGvxLedger(db) {
  await createTable(db);
  await ensureChainColumns(db);
  await backfillLegacyChain(db);
  await createIndexesAndTriggers(db);
}

async function createTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gvx_development_events (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL, entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('snapshot_created', 'transformation_proposed',
      'experiment_started', 'experiment_finished', 'evidence_attached', 'decision_recorded',
      'application_recorded', 'transfer_recorded', 'rollback_recorded')),
    parent_hash TEXT, candidate_hash TEXT, payload_json TEXT NOT NULL,
    previous_event_hash TEXT NOT NULL DEFAULT '', event_hash TEXT NOT NULL DEFAULT '', control_plane_mac TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

async function ensureChainColumns(db) {
  const columns = new Set((await db.all('PRAGMA table_info(gvx_development_events)')).map((column) => column.name));
  const additions = [['previous_event_hash', "TEXT NOT NULL DEFAULT ''"], ['event_hash', "TEXT NOT NULL DEFAULT ''"],
    ['control_plane_mac', 'TEXT']].filter(([name]) => !columns.has(name));
  if (additions.length) await db.exec('DROP TRIGGER IF EXISTS gvx_events_no_update');
  for (const [name, type] of additions) await db.exec(`ALTER TABLE gvx_development_events ADD COLUMN ${name} ${type}`);
}

async function backfillLegacyChain(db) {
  const rows = await db.all(`SELECT rowid AS rowId, id, organization_id AS organizationId,
    project_id AS projectId, entity_id AS entityId, event_type AS type, parent_hash AS parentHash,
    candidate_hash AS candidateHash, payload_json AS payloadJson, created_at AS createdAt,
    previous_event_hash AS previousEventHash, event_hash AS eventHash, control_plane_mac AS controlPlaneMac
    FROM gvx_development_events ORDER BY rowid ASC`);
  if (!rows.length || rows.every((row) => row.eventHash)) return verifyMigratedChain(rows);
  if (rows.some((row) => row.eventHash || row.previousEventHash)) throw chainMigrationError('partial-chain');
  await db.exec('BEGIN IMMEDIATE');
  try {
    await writeLegacyHashes(db, rows);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

function verifyMigratedChain(rows) {
  const result = integrity.verifyRows(rows, { secret: process.env.GENOS_GVX_LEDGER_HMAC_SECRET || undefined });
  if (!result.valid) throw chainMigrationError(result.reason);
}

async function writeLegacyHashes(db, rows) {
  let previous = integrity.GENESIS_HASH;
  for (const row of rows) {
    const eventHash = integrity.hashEvent(previous, row);
    const mac = integrity.macEvent(eventHash);
    await db.run(`UPDATE gvx_development_events SET previous_event_hash = ?, event_hash = ?,
      control_plane_mac = ? WHERE rowid = ?`, previous, eventHash, mac, row.rowId);
    previous = eventHash;
  }
}

async function createIndexesAndTriggers(db) {
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gvx_events_scope
      ON gvx_development_events(organization_id, project_id, entity_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_gvx_events_parent
      ON gvx_development_events(parent_hash) WHERE parent_hash IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS gvx_events_no_update
      BEFORE UPDATE ON gvx_development_events BEGIN SELECT RAISE(ABORT, 'gvx_event_is_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS gvx_events_no_delete
      BEFORE DELETE ON gvx_development_events BEGIN SELECT RAISE(ABORT, 'gvx_event_is_immutable'); END;`);
}

function chainMigrationError(reason) {
  return Object.assign(new Error(`gvx-ledger-chain-invalid:${reason}`), { code: 'GVX_LEDGER_CHAIN_INVALID' });
}

module.exports = { migrateGvxLedger };
