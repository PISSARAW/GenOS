'use strict';

async function migrateHolobiontContracts(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS holobiont_symbiosis_contracts (
      contract_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      holobiont_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      symbiont_id TEXT NOT NULL,
      constitution_revision INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'TERMINATED', 'EXPIRED')),
      contract_json TEXT NOT NULL CHECK (json_valid(contract_json)),
      reason TEXT,
      created_by TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (contract_id, revision),
      FOREIGN KEY (holobiont_id) REFERENCES holobiont_sessions(holobiont_id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_holobiont_contracts_relation
      ON holobiont_symbiosis_contracts(holobiont_id, symbiont_id, revision DESC);
    CREATE INDEX IF NOT EXISTS idx_holobiont_contracts_host_status
      ON holobiont_symbiosis_contracts(host_id, status, created_at);

    CREATE TRIGGER IF NOT EXISTS holobiont_contracts_no_update
      BEFORE UPDATE ON holobiont_symbiosis_contracts
      BEGIN SELECT RAISE(ABORT, 'holobiont_symbiosis_contracts is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS holobiont_contracts_no_delete
      BEFORE DELETE ON holobiont_symbiosis_contracts
      BEGIN SELECT RAISE(ABORT, 'holobiont_symbiosis_contracts is append-only'); END;
  `);
}

module.exports = { migrateHolobiontContracts };
