'use strict';

async function columns(db) {
  return new Set((await db.all('PRAGMA table_info(metabolic_ledger_observations)'))
    .map((column) => column.name));
}

async function ledgerExists(db) {
  const table = await db.get(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'metabolic_ledger_observations'`);
  return table?.name === 'metabolic_ledger_observations';
}

async function addMissingColumns(db) {
  const existing = await columns(db);
  const additions = [
    ['episode_id', 'TEXT'],
    ['worker_id', 'TEXT'],
    ['observation_hash', 'TEXT']
  ];
  for (const [name, type] of additions) {
    if (!existing.has(name)) {
      await db.exec(`ALTER TABLE metabolic_ledger_observations ADD COLUMN ${name} ${type}`);
    }
  }
}

async function migrateMetabolicLedgerCellLineage(db) {
  if (await ledgerExists(db)) await addMissingColumns(db);
  await require('./migrateMetabolicLedger').migrateMetabolicLedger(db);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metabolic_ledger_worker
      ON metabolic_ledger_observations(worker_id, observed_at, observation_id)
      WHERE worker_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_metabolic_ledger_cell
      ON metabolic_ledger_observations(
        organization_id, project_id, mission_id, episode_id, thread_id, worker_id
      );
  `);
}

module.exports = { migrateMetabolicLedgerCellLineage };
