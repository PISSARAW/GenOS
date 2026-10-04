'use strict';

async function migrateAeisAssemblyLifecycle(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS aeis_assurance_assemblies (
    id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, manifest_json TEXT NOT NULL,
    signature TEXT NOT NULL, key_id TEXT NOT NULL DEFAULT 'legacy',
    signature_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  const columns = await db.all('PRAGMA table_info(aeis_assurance_assemblies)');
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('key_id')) await db.exec("ALTER TABLE aeis_assurance_assemblies ADD COLUMN key_id TEXT NOT NULL DEFAULT 'legacy'");
  if (!names.has('signature_version')) await db.exec('ALTER TABLE aeis_assurance_assemblies ADD COLUMN signature_version INTEGER NOT NULL DEFAULT 1');
  if (!names.has('created_at')) await db.exec('ALTER TABLE aeis_assurance_assemblies ADD COLUMN created_at TEXT');
  await db.exec("UPDATE aeis_assurance_assemblies SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");
  await db.exec('CREATE INDEX IF NOT EXISTS idx_aeis_assemblies_created ON aeis_assurance_assemblies(created_at)');
}

module.exports = { migrateAeisAssemblyLifecycle };
