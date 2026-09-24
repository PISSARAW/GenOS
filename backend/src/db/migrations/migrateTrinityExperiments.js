'use strict';

async function migrateTrinityExperiments(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trinity_experiments (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL,
      mission_snapshot_hash TEXT NOT NULL,
      design_json TEXT NOT NULL DEFAULT '{}',
      isolation_policy_json TEXT NOT NULL DEFAULT '{}',
      budget_policy_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'designed' CHECK (status IN (
        'designed','sealed_running','sealed_complete','cross_examining','decided',
        'promotion_preparing','promoted','rejected','escalated','promotion_failed'
      )),
      decision_json TEXT,
      failure_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_trinity_experiments_status ON trinity_experiments(status, updated_at);
  `);
  await addWorldColumns(db);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trinity_worlds_experiment ON trinity_worlds(experiment_id, world_number);`);
}

async function addWorldColumns(db) {
  const columns = new Set((await db.all('PRAGMA table_info(trinity_worlds)')).map((column) => column.name));
  const additions = [
    ['experiment_id', 'ALTER TABLE trinity_worlds ADD COLUMN experiment_id TEXT'],
    ['chamber', 'ALTER TABLE trinity_worlds ADD COLUMN chamber TEXT'],
    ['snapshot_hash', 'ALTER TABLE trinity_worlds ADD COLUMN snapshot_hash TEXT'],
    ['workspace_root', 'ALTER TABLE trinity_worlds ADD COLUMN workspace_root TEXT'],
    ['evidence_vector_json', 'ALTER TABLE trinity_worlds ADD COLUMN evidence_vector_json TEXT']
  ];
  for (const [column, sql] of additions) {
    if (!columns.has(column)) await db.exec(sql);
  }
}

module.exports = { migrateTrinityExperiments };
