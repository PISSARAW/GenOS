'use strict';

async function migrateMetapopulationCycleIdempotency(db) {
  const columns = await db.all('PRAGMA table_info(metapopulation_cycle_states)');
  if (!columns.some((entry) => entry.name === 'idempotency_key')) {
    await db.exec('ALTER TABLE metapopulation_cycle_states ADD COLUMN idempotency_key TEXT');
  }
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cycle_states_idempotency_key
    ON metapopulation_cycle_states(metapopulation_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL`);
}

module.exports = { migrateMetapopulationCycleIdempotency };
