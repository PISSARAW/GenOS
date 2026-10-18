'use strict';

const { migrateProjectConfig, validateProjectConfig } = require('../../services/ontogenesis/configSchema');

async function createFoundationTables(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_operations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'prepared'
        CHECK (state IN ('prepared','started','effect_applied','verified','committed',
          'completed','failed','compensated','escalated')),
      idempotency_key TEXT NOT NULL,
      intent_hash TEXT NOT NULL,
      intent_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      failure_json TEXT NOT NULL DEFAULT '{}',
      recovery_owner TEXT,
      recovery_expires_at TEXT,
      recovery_attempt INTEGER NOT NULL DEFAULT 0 CHECK (recovery_attempt >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_onto_operations_recovery
      ON ontogenesis_operations(project_id, state, recovery_expires_at, updated_at);

    CREATE TABLE IF NOT EXISTS ontogenesis_artifacts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      operation_id TEXT REFERENCES ontogenesis_operations(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      content_hash TEXT,
      state TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('active','retained','quarantined','purged')),
      retention_class TEXT NOT NULL DEFAULT 'operational'
        CHECK (retention_class IN ('transient','operational','evidence')),
      legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0,1)),
      purge_after TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, path)
    );
    CREATE INDEX IF NOT EXISTS idx_onto_artifacts_retention
      ON ontogenesis_artifacts(project_id, state, legal_hold, purge_after);

    CREATE TABLE IF NOT EXISTS ontogenesis_outbox (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      operation_id TEXT REFERENCES ontogenesis_operations(id) ON DELETE SET NULL,
      channel TEXT NOT NULL,
      kind TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending','delivering','delivered','acked','dead_letter')),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      available_at TEXT NOT NULL DEFAULT (datetime('now')),
      lease_owner TEXT,
      lease_expires_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, dedupe_key)
    );
    CREATE INDEX IF NOT EXISTS idx_onto_outbox_delivery
      ON ontogenesis_outbox(project_id, state, available_at, lease_expires_at);
  `);
}

async function upgradeConfigurations(db) {
  const rows = await db.all('SELECT id, config_json, config_version FROM ontogenesis_projects');
  for (const row of rows) {
    const parsed = JSON.parse(row.config_json || '{}');
    const source = { ...parsed, version: parsed.version ?? row.config_version };
    const config = migrateProjectConfig(source);
    const checked = validateProjectConfig(config);
    if (!checked.ok) throw new Error(`configuration-migree-invalide:${row.id}:${checked.errors.join(',')}`);
    await db.run(`UPDATE ontogenesis_projects SET config_json = ?, config_version = ?,
      updated_at = datetime('now') WHERE id = ?`, [JSON.stringify(config), config.version, row.id]);
  }
}

async function migrateOntogenesisDurableFoundation(db) {
  await db.exec('BEGIN IMMEDIATE');
  try {
    await createFoundationTables(db);
    await upgradeConfigurations(db);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { migrateOntogenesisDurableFoundation };
