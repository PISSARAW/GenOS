'use strict';

async function ensureColumn(db, options) {
  const { table, column, declaration } = options;
  const columns = await db.all(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
}

async function migrateMetapopulation(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS metapopulation_sessions (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      mission TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT 'quorum_with_abstention',
      scope TEXT NOT NULL CHECK (scope IN ('mission', 'workspace', 'project', 'persistent')),
      status TEXT NOT NULL CHECK (status IN ('FORMING', 'ACTIVE', 'RECOVERING', 'DEGRADED', 'ESCALATED', 'QUIESCENT', 'CLOSED')),
      generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      migration_graph_json TEXT NOT NULL DEFAULT '{}',
      regional_memory_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (json_valid(migration_graph_json)),
      CHECK (json_valid(regional_memory_json))
    );
    CREATE TABLE IF NOT EXISTS metapopulation_patches (
      patch_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      environment_json TEXT NOT NULL DEFAULT '{}',
      requirements_json TEXT NOT NULL DEFAULT '[]',
      resources_json TEXT NOT NULL DEFAULT '{}',
      carrying_capacity INTEGER NOT NULL CHECK (carrying_capacity >= 0),
      quality REAL NOT NULL CHECK (quality >= 0 AND quality <= 1),
      accessibility REAL NOT NULL CHECK (accessibility >= 0 AND accessibility <= 1),
      status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'VACANT', 'QUARANTINED', 'UNAVAILABLE')),
      current_deme_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      CHECK (json_valid(environment_json)),
      CHECK (json_valid(requirements_json)),
      CHECK (json_valid(resources_json))
    );
    CREATE INDEX IF NOT EXISTS idx_metapopulation_patches_session ON metapopulation_patches(metapopulation_id, status);
    CREATE TABLE IF NOT EXISTS metapopulation_demes (
      deme_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      patch_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('FOUNDING', 'ESTABLISHING', 'ACTIVE', 'STRESSED', 'AT_RISK', 'COLLAPSED', 'DORMANT', 'QUARANTINED', 'RECOLONIZING')),
      members_json NOT NULL DEFAULT '[]',
      local_state_ref TEXT,
      local_memory_ref TEXT,
      local_strategies_json NOT NULL DEFAULT '[]',
      local_procedures_json NOT NULL DEFAULT '[]',
      lineage_json NOT NULL DEFAULT '{}',
      founder_lineages_json NOT NULL DEFAULT '{}',
      evidence_json NOT NULL DEFAULT '{}',
      provenance_json NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (patch_id) REFERENCES metapopulation_patches(patch_id) ON DELETE CASCADE,
      CHECK (json_valid(members_json)),
      CHECK (json_valid(local_strategies_json)),
      CHECK (json_valid(local_procedures_json)),
      CHECK (json_valid(lineage_json)),
      CHECK (json_valid(founder_lineages_json)),
      CHECK (json_valid(evidence_json)),
      CHECK (json_valid(provenance_json))
    );
    CREATE TABLE IF NOT EXISTS metapopulation_corridors (
      corridor_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      source_deme_id TEXT NOT NULL,
      target_deme_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PLANNED', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
      strength REAL NOT NULL DEFAULT 0,
      protocol_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      capacity REAL NOT NULL DEFAULT 0,
      migration_cost REAL NOT NULL DEFAULT 0,
      compatibility REAL NOT NULL DEFAULT 0,
      accepted_migrations INTEGER NOT NULL DEFAULT 0,
      rejected_migrations INTEGER NOT NULL DEFAULT 0,
      benefit_history_json TEXT NOT NULL DEFAULT '[]',
      homogenization_risk REAL NOT NULL DEFAULT 0,
      weight REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT '',
      provenance_json NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (source_deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE,
      FOREIGN KEY (target_deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE,
      CHECK (json_valid(protocol_json)),
      CHECK (json_valid(provenance_json))
    );
    CREATE TABLE IF NOT EXISTS metapopulation_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      metapopulation_id TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK (sequence >= 1),
      revision INTEGER NOT NULL CHECK (revision >= 1),
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      provenance_json TEXT NOT NULL DEFAULT '{}',
      actor TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      UNIQUE (metapopulation_id, sequence),
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      CHECK (json_valid(payload_json)),
      CHECK (json_valid(provenance_json))
    );
    CREATE TABLE IF NOT EXISTS metapopulation_migrations (
      migration_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      corridor_id TEXT NOT NULL,
      source_deme_id TEXT NOT NULL,
      target_deme_id TEXT NOT NULL,
      propagule_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('QUARANTINED', 'ACCEPTED', 'REJECTED', 'ROLLED_BACK')),
      payload_ref TEXT NOT NULL,
      provenance_json TEXT NOT NULL DEFAULT '{}',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (corridor_id) REFERENCES metapopulation_corridors(corridor_id) ON DELETE CASCADE,
      FOREIGN KEY (source_deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE,
      FOREIGN KEY (target_deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE,
      CHECK (json_valid(provenance_json)),
      CHECK (json_valid(evidence_json))
    );
    CREATE TABLE IF NOT EXISTS metapopulation_colonizations (
      colonization_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      patch_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('IN_TRIAL', 'COMPLETING', 'ACCEPTED', 'FAILED')),
      founder_lineages_json TEXT NOT NULL DEFAULT '[]',
      deme_id TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      provenance_json TEXT NOT NULL DEFAULT '{}',
      actor TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (patch_id) REFERENCES metapopulation_patches(patch_id) ON DELETE CASCADE,
      CHECK (json_valid(founder_lineages_json)),
      CHECK (json_valid(evidence_json)),
      CHECK (json_valid(provenance_json))
    );
    CREATE INDEX IF NOT EXISTS idx_metapopulation_colonizations_patch ON metapopulation_colonizations(metapopulation_id, patch_id, status);
    CREATE INDEX IF NOT EXISTS idx_metapopulation_demes_metapopulation ON metapopulation_demes(metapopulation_id);
    CREATE INDEX IF NOT EXISTS idx_metapopulation_corridors_source ON metapopulation_corridors(source_deme_id);
    CREATE INDEX IF NOT EXISTS idx_metapopulation_corridors_target ON metapopulation_corridors(target_deme_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_metapopulation_corridors_pair ON metapopulation_corridors(metapopulation_id, source_deme_id, target_deme_id);
    CREATE INDEX IF NOT EXISTS idx_metapopulation_events_session_sequence ON metapopulation_events(metapopulation_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_metapopulation_migrations_quarantine ON metapopulation_migrations(corridor_id, status);
  `);
  // Add missing columns from legacy schemas
  await ensureColumn(db, { table: 'metapopulation_sessions', column: 'organization', declaration: "TEXT NOT NULL DEFAULT 'quorum_with_abstention'" });
  await ensureColumn(db, { table: 'metapopulation_sessions', column: 'variant', declaration: 'TEXT' });
  await ensureColumn(db, { table: 'metapopulation_sessions', column: 'variant_policy_json', declaration: "TEXT NOT NULL DEFAULT '{}'" });
  await ensureColumn(db, { table: 'metapopulation_sessions', column: 'variant_selection_json', declaration: "TEXT NOT NULL DEFAULT '{}'" });
  await ensureColumn(db, { table: 'metapopulation_demes', column: 'fitness_json', declaration: "TEXT NOT NULL DEFAULT '{}'" });
  await ensureColumn(db, { table: 'metapopulation_demes', column: 'diversity', declaration: 'REAL NOT NULL DEFAULT 0' });
  await ensureColumn(db, { table: 'metapopulation_demes', column: 'last_heartbeat_at', declaration: 'TEXT' });
  await ensureColumn(db, { table: 'metapopulation_demes', column: 'created_at', declaration: "TEXT NOT NULL DEFAULT ''" });
  await ensureCorridorColumns(db);
}

async function ensureCorridorColumns(db) {
  const columns = [
    ['enabled', 'INTEGER NOT NULL DEFAULT 1'], ['capacity', 'REAL NOT NULL DEFAULT 0'],
    ['migration_cost', 'REAL NOT NULL DEFAULT 0'], ['compatibility', 'REAL NOT NULL DEFAULT 0'],
    ['accepted_migrations', 'INTEGER NOT NULL DEFAULT 0'], ['rejected_migrations', 'INTEGER NOT NULL DEFAULT 0'],
    ['benefit_history_json', "TEXT NOT NULL DEFAULT '[]'"], ['homogenization_risk', 'REAL NOT NULL DEFAULT 0'],
    ['weight', 'REAL NOT NULL DEFAULT 0.5'], ['created_at', "TEXT NOT NULL DEFAULT ''"]
  ];
  for (const [name, declaration] of columns) await ensureColumn(db, { table: 'metapopulation_corridors', column: name, declaration });
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_metapopulation_corridors_pair ON metapopulation_corridors(metapopulation_id, source_deme_id, target_deme_id)');
}

module.exports = { migrateMetapopulation };
