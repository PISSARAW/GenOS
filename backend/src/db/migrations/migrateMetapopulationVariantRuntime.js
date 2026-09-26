'use strict';
const { migrateMetapopulation } = require('./migrateMetapopulation');

async function migrateMetapopulationVariantRuntime(db) {
  await migrateMetapopulation(db);
  await ensureTable(db, 'ephemeral_leases');
  await ensureTable(db, 'daemon_leases');
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
  }
}

module.exports = { migrateMetapopulationVariantRuntime };
