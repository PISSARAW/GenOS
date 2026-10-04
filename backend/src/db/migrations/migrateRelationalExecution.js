'use strict';

async function migrateRelationalExecution(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS rpe_communication_grants (
    organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    actor_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
    refs_json TEXT NOT NULL CHECK (json_valid(refs_json)),
    valid_until_ms INTEGER NOT NULL, required_ack TEXT NOT NULL DEFAULT 'none',
    PRIMARY KEY (organization_id, project_id, actor_id, receiver_id)
  );
  CREATE TABLE IF NOT EXISTS rpe_execution_decisions (
    organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
    receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
    result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
    status TEXT NOT NULL CHECK (status IN ('evaluated', 'denied', 'silent', 'admitted')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, project_id, operation_id)
  );`);
}

module.exports = { migrateRelationalExecution };
