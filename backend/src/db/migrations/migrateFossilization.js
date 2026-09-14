async function migrateFossilization(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS fossil_strata (
    stratum_id TEXT PRIMARY KEY,
    deposited_at DATETIME NOT NULL,
    fossil_count INTEGER NOT NULL DEFAULT 0,
    organization_id TEXT,
    project_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_fossil_strata_deposited ON fossil_strata(deposited_at);
  CREATE INDEX IF NOT EXISTS idx_fossil_strata_scope ON fossil_strata(organization_id, project_id);`);

  await db.exec(`CREATE TABLE IF NOT EXISTS fossils (
    fossil_id TEXT PRIMARY KEY,
    extinct_lineage_id TEXT NOT NULL,
    reason TEXT,
    mode TEXT NOT NULL DEFAULT 'petrification',
    stratum_id TEXT,
    payload_hash TEXT NOT NULL,
    conservation_quality REAL NOT NULL DEFAULT 1.0,
    hard_parts_json TEXT NOT NULL DEFAULT '[]',
    soft_parts_lost_json TEXT NOT NULL DEFAULT '[]',
    phenotype_markers_json TEXT NOT NULL DEFAULT '[]',
    mineral_payload_json TEXT,
    organization_id TEXT,
    project_id TEXT,
    recorded_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_fossils_lineage ON fossils(extinct_lineage_id);
  CREATE INDEX IF NOT EXISTS idx_fossils_stratum ON fossils(stratum_id);
  CREATE INDEX IF NOT EXISTS idx_fossils_scope ON fossils(organization_id, project_id);
  CREATE INDEX IF NOT EXISTS idx_fossils_recorded ON fossils(recorded_at);`);
}

module.exports = { migrateFossilization };
