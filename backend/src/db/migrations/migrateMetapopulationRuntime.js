'use strict';
const { migrateMetapopulation } = require('./migrateMetapopulation');

async function migrateMetapopulationRuntime(db) {
  await migrateMetapopulation(db);
  const { migrateMetapopulationVariantRuntime } = require('./migrateMetapopulationVariantRuntime');
  await migrateMetapopulationVariantRuntime(db);
  await ensureColumn(db, { table: 'metapopulation_demes', column: 'workspace_path', declaration: 'TEXT' });
  await ensureColumn(db, { table: 'metapopulation_demes', column: 'workspace_owner_id', declaration: 'TEXT' });
  await ensureColumn(db, { table: 'metapopulation_demes', column: 'local_boundary_json', declaration: "TEXT NOT NULL DEFAULT '[]'" });
  await ensureColumn(db, { table: 'metapopulation_demes', column: 'budget_json', declaration: "TEXT NOT NULL DEFAULT '{}'" });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS metapopulation_deme_heartbeats (
      heartbeat_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      deme_id TEXT NOT NULL,
      local_state_version TEXT NOT NULL,
      health TEXT NOT NULL CHECK (health IN ('HEALTHY', 'STRESSED', 'DEGRADED', 'UNKNOWN')),
      last_evidence_at TEXT,
      migration_ready INTEGER NOT NULL CHECK (migration_ready IN (0, 1)),
      recovery_ready INTEGER NOT NULL CHECK (recovery_ready IN (0, 1)),
      provenance_json TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE,
      CHECK (json_valid(provenance_json))
    );
    CREATE INDEX IF NOT EXISTS idx_metapopulation_heartbeats_deme_time
      ON metapopulation_deme_heartbeats(metapopulation_id, deme_id, occurred_at DESC);
  `);
}

async function ensureColumn(db, options) {
  const { table, column, declaration } = options;
  const columns = await db.all(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
}

module.exports = { migrateMetapopulationRuntime };
