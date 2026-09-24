'use strict';

async function migrateMetapopulation(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS metapopulation_sessions (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      mission TEXT NOT NULL,
      organization TEXT NOT NULL,
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
      members_json TEXT NOT NULL DEFAULT '[]',
      local_state_ref TEXT,
      local_memory_ref TEXT,
      local_strategies_json TEXT NOT NULL DEFAULT '[]',
      local_procedures_json TEXT NOT NULL DEFAULT '[]',
      lineage_json TEXT NOT NULL DEFAULT '{}',
      fitness_json TEXT NOT NULL DEFAULT '{}',
      diversity REAL NOT NULL DEFAULT 0 CHECK (diversity >= 0 AND diversity <= 1),
      last_heartbeat_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (patch_id) REFERENCES metapopulation_patches(patch_id) ON DELETE RESTRICT,
      CHECK (json_valid(members_json)),
      CHECK (json_valid(local_strategies_json)),
      CHECK (json_valid(local_procedures_json)),
      CHECK (json_valid(lineage_json)),
      CHECK (json_valid(fitness_json))
    );
    CREATE INDEX IF NOT EXISTS idx_metapopulation_demes_session ON metapopulation_demes(metapopulation_id, status);
    CREATE TABLE IF NOT EXISTS metapopulation_corridors (
      corridor_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      source_deme_id TEXT NOT NULL,
      target_deme_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
      migration_cost REAL NOT NULL DEFAULT 0 CHECK (migration_cost >= 0),
      compatibility REAL NOT NULL DEFAULT 0 CHECK (compatibility >= 0 AND compatibility <= 1),
      accepted_migrations INTEGER NOT NULL DEFAULT 0 CHECK (accepted_migrations >= 0),
      rejected_migrations INTEGER NOT NULL DEFAULT 0 CHECK (rejected_migrations >= 0),
      benefit_history_json TEXT NOT NULL DEFAULT '[]',
      homogenization_risk REAL NOT NULL DEFAULT 0 CHECK (homogenization_risk >= 0 AND homogenization_risk <= 1),
      weight REAL NOT NULL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (metapopulation_id, source_deme_id, target_deme_id),
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (source_deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE,
      FOREIGN KEY (target_deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE,
      CHECK (json_valid(benefit_history_json))
    );
    CREATE TABLE IF NOT EXISTS metapopulation_migrations (
      migration_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      corridor_id TEXT,
      source_deme_id TEXT NOT NULL,
      target_deme_id TEXT NOT NULL,
      propagule_type TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_ref TEXT,
      provenance_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (corridor_id) REFERENCES metapopulation_corridors(corridor_id) ON DELETE SET NULL,
      CHECK (json_valid(provenance_json)),
      CHECK (json_valid(evidence_json))
    );
    CREATE INDEX IF NOT EXISTS idx_metapopulation_migrations_session ON metapopulation_migrations(metapopulation_id, created_at);
    CREATE TABLE IF NOT EXISTS metapopulation_extinctions (
      extinction_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      deme_id TEXT NOT NULL,
      patch_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      provenance_json TEXT NOT NULL DEFAULT '{}',
      actor TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      CHECK (json_valid(provenance_json))
    );
    CREATE TABLE IF NOT EXISTS metapopulation_colonizations (
      colonization_id TEXT PRIMARY KEY,
      metapopulation_id TEXT NOT NULL,
      patch_id TEXT NOT NULL,
      deme_id TEXT,
      status TEXT NOT NULL,
      founder_lineages_json TEXT NOT NULL DEFAULT '[]',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      provenance_json TEXT NOT NULL DEFAULT '{}',
      actor TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      CHECK (json_valid(founder_lineages_json)),
      CHECK (json_valid(evidence_json)),
      CHECK (json_valid(provenance_json))
    );
    CREATE TABLE IF NOT EXISTS metapopulation_events (
      metapopulation_id TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      revision INTEGER NOT NULL CHECK (revision > 0),
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      provenance_json TEXT NOT NULL DEFAULT '{}',
      actor TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (metapopulation_id, sequence),
      UNIQUE (metapopulation_id, revision),
      FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
      CHECK (json_valid(payload_json)),
      CHECK (json_valid(provenance_json))
    );
    CREATE INDEX IF NOT EXISTS idx_metapopulation_events_type_time ON metapopulation_events(event_type, occurred_at);
  `);
}

module.exports = { migrateMetapopulation };
