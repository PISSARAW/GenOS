'use strict';

async function migrateGciEvolution(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gci_project_revocations (
    organization_id TEXT NOT NULL, project_id TEXT NOT NULL, capability_id TEXT NOT NULL,
    version TEXT NOT NULL, reason TEXT NOT NULL, revoked_by TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, project_id, capability_id, version)
  );
  CREATE TABLE IF NOT EXISTS gci_upgrade_candidates (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    environment TEXT NOT NULL, source_graph_digest TEXT NOT NULL, candidate_graph_digest TEXT NOT NULL,
    plan_json TEXT NOT NULL CHECK (json_valid(plan_json)), status TEXT NOT NULL
      CHECK (status IN ('resolved', 'no_change')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, project_id, environment, source_graph_digest, candidate_graph_digest)
  );
  CREATE INDEX IF NOT EXISTS idx_gci_revocations_scope
    ON gci_project_revocations(organization_id, project_id, capability_id);
  CREATE INDEX IF NOT EXISTS idx_gci_upgrade_scope
    ON gci_upgrade_candidates(organization_id, project_id, environment, created_at);`);
}

module.exports = { migrateGciEvolution };
