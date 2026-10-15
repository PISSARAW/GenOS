'use strict';

async function migrateClinicalAuthorizationLedger(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS clinical_authorization_ledger (
    authorization_id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    cell_id TEXT NOT NULL,
    signature TEXT NOT NULL,
    authorization_json TEXT NOT NULL CHECK (json_valid(authorization_json)),
    approver_id TEXT NOT NULL,
    issued_at_unix_ms INTEGER NOT NULL,
    revoked_by TEXT,
    revoked_at_unix_ms INTEGER,
    CHECK ((revoked_by IS NULL) = (revoked_at_unix_ms IS NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_clinical_authorization_scope
    ON clinical_authorization_ledger(organization_id, project_id, mission_id, issued_at_unix_ms);
  CREATE TRIGGER IF NOT EXISTS clinical_authorization_claims_immutable
    BEFORE UPDATE OF authorization_id, mission_id, organization_id, project_id, cell_id,
      signature, authorization_json, approver_id, issued_at_unix_ms
    ON clinical_authorization_ledger
    BEGIN SELECT RAISE(ABORT, 'Clinical authorization claims are immutable'); END;
  CREATE TABLE IF NOT EXISTS clinical_authorization_applications (
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    authorization_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    claimant_id TEXT NOT NULL,
    claim_token TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('claimed', 'completed')),
    attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
    claimed_at_unix_ms INTEGER NOT NULL,
    lease_until_unix_ms INTEGER NOT NULL,
    completed_at_unix_ms INTEGER,
    result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
    PRIMARY KEY (organization_id, project_id, authorization_id, operation_id),
    CHECK ((state = 'completed') = (completed_at_unix_ms IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_clinical_application_recovery
    ON clinical_authorization_applications(state, lease_until_unix_ms);
  `);
}

module.exports = { migrateClinicalAuthorizationLedger };
