'use strict';
const { migrateMetapopulation } = require('./migrateMetapopulation');

async function migrateMetapopulationVariantRuntime(db) {
  await migrateMetapopulation(db);
  await ensureTable(db, 'ephemeral_leases');
  await ensureTable(db, 'daemon_leases');
  await ensureTable(db, 'cycle_states');
  await ensureTable(db, 'daemon_memory');
  await ensureTable(db, 'mission_fitness');
  await ensureTable(db, 'cultures');
  await ensureTable(db, 'culture_transmissions');
  await ensureTable(db, 'culture_phylogeny');
  await ensureColumn(db, { table: 'daemon_leases', column: 'daemon_id', declaration: 'TEXT' });
}

async function ensureColumn(db, options) {
  const { table, column, declaration } = options;
  const columns = await db.all(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
}

async function ensureTable(db, table) {
  if (table === 'ephemeral_leases') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ephemeral_leases (
        lease_id TEXT PRIMARY KEY,
        metapopulation_id TEXT NOT NULL,
        patch_id TEXT NOT NULL,
        ttl_ms INTEGER NOT NULL DEFAULT 300000,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (patch_id) REFERENCES metapopulation_patches(patch_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ephemeral_leases_patch ON ephemeral_leases(metapopulation_id, patch_id, active);
    `);
  } else if (table === 'daemon_leases') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_leases (
        lease_id TEXT PRIMARY KEY,
        metapopulation_id TEXT NOT NULL,
        deme_id TEXT NOT NULL,
        daemon_id TEXT,
        ttl_ms INTEGER NOT NULL DEFAULT 600000,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        updated_at TEXT NOT NULL,
        FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_daemon_leases_deme ON daemon_leases(metapopulation_id, deme_id, active);
    `);
  } else if (table === 'cycle_states') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS metapopulation_cycle_states (
        state_id TEXT PRIMARY KEY,
        metapopulation_id TEXT NOT NULL,
        cycle INTEGER NOT NULL CHECK (cycle >= 0),
        seed TEXT NOT NULL,
        observed_json TEXT NOT NULL DEFAULT '{}',
        diagnosis_json TEXT NOT NULL DEFAULT '{}',
        plan_json TEXT NOT NULL DEFAULT '{}',
        execution_json TEXT NOT NULL DEFAULT '{}',
        verification_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL CHECK (status IN ('VERIFIED', 'FAILED', 'RESUMED')),
        created_at TEXT NOT NULL,
        FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
        CHECK (json_valid(observed_json)),
        CHECK (json_valid(diagnosis_json)),
        CHECK (json_valid(plan_json)),
        CHECK (json_valid(execution_json)),
        CHECK (json_valid(verification_json))
      );
      CREATE INDEX IF NOT EXISTS idx_cycle_states_session_cycle ON metapopulation_cycle_states(metapopulation_id, cycle);
      CREATE INDEX IF NOT EXISTS idx_cycle_states_status ON metapopulation_cycle_states(metapopulation_id, status);
    `);
  } else if (table === 'daemon_memory') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_memory (
        memory_id TEXT PRIMARY KEY,
        metapopulation_id TEXT NOT NULL,
        deme_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        content_json TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        decay_factor REAL NOT NULL DEFAULT 1.0,
        parent_memory_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE,
        CHECK (json_valid(content_json)),
        CHECK (decay_factor >= 0 AND decay_factor <= 1)
      );
      CREATE INDEX IF NOT EXISTS idx_daemon_memory_deme ON daemon_memory(metapopulation_id, deme_id, version);
    `);
  } else if (table === 'mission_fitness') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS mission_fitness (
        fitness_id TEXT PRIMARY KEY,
        metapopulation_id TEXT NOT NULL,
        deme_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        cycle INTEGER NOT NULL,
        fitness_score REAL NOT NULL CHECK (fitness_score >= 0 AND fitness_score <= 1),
        budget_used INTEGER NOT NULL DEFAULT 0,
        budget_limit INTEGER NOT NULL DEFAULT 600000,
        created_at TEXT NOT NULL,
        FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_mission_fitness_deme ON mission_fitness(metapopulation_id, deme_id, mission_id);
    `);
  } else if (table === 'cultures') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS metapopulation_cultures (
        culture_id TEXT NOT NULL,
        metapopulation_id TEXT NOT NULL,
        culture_version INTEGER NOT NULL DEFAULT 1,
        parent_culture_id TEXT,
        payload_type TEXT NOT NULL,
        payload_ref TEXT NOT NULL,
        author TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        content_json TEXT NOT NULL DEFAULT '{}',
        registered_at TEXT NOT NULL,
        transmission_count INTEGER NOT NULL DEFAULT 0,
        immutable INTEGER NOT NULL DEFAULT 1 CHECK (immutable IN (0, 1)),
        FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
        PRIMARY KEY (metapopulation_id, culture_id),
        FOREIGN KEY (metapopulation_id, parent_culture_id)
          REFERENCES metapopulation_cultures(metapopulation_id, culture_id) ON DELETE CASCADE,
        CHECK (json_valid(content_json))
      );
      CREATE INDEX IF NOT EXISTS idx_cultures_session ON metapopulation_cultures(metapopulation_id, culture_id);
      CREATE INDEX IF NOT EXISTS idx_cultures_parent ON metapopulation_cultures(parent_culture_id);
    `);
  } else if (table === 'culture_transmissions') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS culture_transmissions (
        transmission_id TEXT PRIMARY KEY,
        metapopulation_id TEXT NOT NULL,
        culture_id TEXT NOT NULL,
        source_deme_id TEXT NOT NULL,
        target_deme_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        transmitted_at TEXT NOT NULL,
        compatible INTEGER NOT NULL DEFAULT 1 CHECK (compatible IN (0, 1)),
        source_resident INTEGER NOT NULL DEFAULT 1 CHECK (source_resident IN (0, 1)),
        target_resident INTEGER NOT NULL DEFAULT 1 CHECK (target_resident IN (0, 1)),
        FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (metapopulation_id, culture_id)
          REFERENCES metapopulation_cultures(metapopulation_id, culture_id) ON DELETE CASCADE,
        FOREIGN KEY (source_deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE,
        FOREIGN KEY (target_deme_id) REFERENCES metapopulation_demes(deme_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_transmissions_culture ON culture_transmissions(culture_id);
      CREATE INDEX IF NOT EXISTS idx_transmissions_source ON culture_transmissions(source_deme_id);
      CREATE INDEX IF NOT EXISTS idx_transmissions_target ON culture_transmissions(target_deme_id);
    `);
  } else if (table === 'culture_phylogeny') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS culture_phylogeny (
        node_id TEXT PRIMARY KEY,
        metapopulation_id TEXT NOT NULL,
        culture_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        parents_json TEXT NOT NULL DEFAULT '[]',
        children_json TEXT NOT NULL DEFAULT '[]',
        depth INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (metapopulation_id) REFERENCES metapopulation_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (metapopulation_id, culture_id)
          REFERENCES metapopulation_cultures(metapopulation_id, culture_id) ON DELETE CASCADE,
        CHECK (json_valid(parents_json)),
        CHECK (json_valid(children_json))
      );
      CREATE INDEX IF NOT EXISTS idx_phylogeny_session ON culture_phylogeny(metapopulation_id, culture_id);
    `);
  }
}

module.exports = { migrateMetapopulationVariantRuntime };
