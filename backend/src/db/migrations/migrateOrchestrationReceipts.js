'use strict';

const COLUMNS = {
  claim_token: 'TEXT',
  context_json: 'TEXT',
  result_json: 'TEXT',
  attempts: 'INTEGER NOT NULL DEFAULT 0'
};

async function migrateOrchestrationReceipts(db) {
  const columns = new Set((await db.all('PRAGMA table_info(orchestration_action_receipts)')).map((column) => column.name));
  for (const [name, declaration] of Object.entries(COLUMNS)) {
    if (columns.has(name)) continue;
    try {
      await db.exec(`ALTER TABLE orchestration_action_receipts ADD COLUMN ${name} ${declaration}`);
    } catch (error) {
      // Another backend may have upgraded the same database concurrently.
      if (!/duplicate column name/i.test(error.message)) throw error;
    }
  }
  await db.exec('CREATE INDEX IF NOT EXISTS idx_orchestration_receipt_pending ON orchestration_action_receipts(orchestrator_id, status, created_at)');
}

module.exports = { migrateOrchestrationReceipts };
