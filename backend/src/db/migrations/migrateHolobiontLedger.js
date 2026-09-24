'use strict';

async function migrateHolobiontLedger(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS holobiont_symbiosis_ledger (
      ledger_id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL UNIQUE,
      holobiont_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      contract_revision INTEGER NOT NULL,
      symbiont_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      benefit_score REAL NOT NULL CHECK (benefit_score BETWEEN 0 AND 1),
      contribution_score REAL NOT NULL CHECK (contribution_score BETWEEN 0 AND 1),
      cost_score REAL NOT NULL CHECK (cost_score BETWEEN 0 AND 1),
      risk_score REAL NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
      resources_used_json TEXT NOT NULL CHECK (json_valid(resources_used_json)),
      evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json)),
      verifier_id TEXT NOT NULL,
      result_hash TEXT NOT NULL,
      host_interventions INTEGER NOT NULL DEFAULT 0 CHECK (host_interventions >= 0),
      failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
      false_alerts INTEGER NOT NULL DEFAULT 0 CHECK (false_alerts >= 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (holobiont_id) REFERENCES holobiont_sessions(holobiont_id) ON DELETE RESTRICT,
      FOREIGN KEY (contract_id, contract_revision)
        REFERENCES holobiont_symbiosis_contracts(contract_id, revision) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_holobiont_ledger_relation
      ON holobiont_symbiosis_ledger(holobiont_id, symbiont_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_holobiont_ledger_contract
      ON holobiont_symbiosis_ledger(contract_id, contract_revision);

    CREATE TRIGGER IF NOT EXISTS holobiont_ledger_no_update
      BEFORE UPDATE ON holobiont_symbiosis_ledger
      BEGIN SELECT RAISE(ABORT, 'holobiont_symbiosis_ledger is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS holobiont_ledger_no_delete
      BEFORE DELETE ON holobiont_symbiosis_ledger
      BEGIN SELECT RAISE(ABORT, 'holobiont_symbiosis_ledger is append-only'); END;
  `);
}

module.exports = { migrateHolobiontLedger };
