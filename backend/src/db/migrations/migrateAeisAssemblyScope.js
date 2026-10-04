'use strict';

async function migrateAeisAssemblyScope(db) {
  const columns = await db.all('PRAGMA table_info(aeis_assurance_assemblies)');
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('run_id')) await db.exec('ALTER TABLE aeis_assurance_assemblies ADD COLUMN run_id TEXT');
  if (!names.has('scope_id')) await db.exec('ALTER TABLE aeis_assurance_assemblies ADD COLUMN scope_id TEXT');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_aeis_assemblies_scope_run ON aeis_assurance_assemblies(scope_id, run_id)');
}

module.exports = { migrateAeisAssemblyScope };
