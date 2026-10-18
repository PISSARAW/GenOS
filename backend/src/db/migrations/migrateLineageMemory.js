'use strict';

async function migrateLineageMemory(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS ancestral_memories (
    scope_key TEXT NOT NULL,
    lineage_id TEXT NOT NULL,
    memory_id TEXT NOT NULL,
    ancestor_id TEXT NOT NULL,
    memory_json TEXT NOT NULL DEFAULT '{}',
    salience REAL NOT NULL DEFAULT 0.5 CHECK (salience >= 0 AND salience <= 1),
    organization_id TEXT,
    project_id TEXT,
    recorded_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scope_key, lineage_id, memory_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ancestral_memories_recall
    ON ancestral_memories(scope_key, lineage_id, salience DESC, updated_at DESC);

  CREATE TABLE IF NOT EXISTS inherited_risks (
    scope_key TEXT NOT NULL,
    lineage_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    risk REAL NOT NULL CHECK (risk >= 0 AND risk <= 1),
    depth INTEGER NOT NULL DEFAULT 0 CHECK (depth >= 0),
    attenuation REAL NOT NULL CHECK (attenuation >= 0 AND attenuation <= 1),
    calibration_version TEXT NOT NULL,
    calibration_status TEXT NOT NULL CHECK (calibration_status IN ('provisional', 'qualified')),
    organization_id TEXT,
    project_id TEXT,
    inherited_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scope_key, lineage_id, target_id)
  );
  CREATE INDEX IF NOT EXISTS idx_inherited_risks_lookup
    ON inherited_risks(scope_key, lineage_id, risk DESC, updated_at DESC);`);
}

module.exports = { migrateLineageMemory };
