'use strict';

async function migrateGciCapabilityInheritance(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gci_capability_exports (
    capability_id TEXT NOT NULL, version TEXT NOT NULL, provider_id TEXT NOT NULL,
    descriptor_json TEXT NOT NULL CHECK (json_valid(descriptor_json)), status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'revoked')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at DATETIME,
    PRIMARY KEY (capability_id, version)
  );
  CREATE TABLE IF NOT EXISTS gci_project_bindings (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    provider_id TEXT NOT NULL, manifest_digest TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, project_id, provider_id)
  );
  CREATE TABLE IF NOT EXISTS gci_installations (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    environment TEXT NOT NULL, lockfile_json TEXT NOT NULL CHECK (json_valid(lockfile_json)),
    revision INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'revoked')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, project_id, environment)
  );
  CREATE TABLE IF NOT EXISTS gci_event_ledger (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    event_type TEXT NOT NULL, event_json TEXT NOT NULL CHECK (json_valid(event_json)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS gci_project_revocations (
    organization_id TEXT NOT NULL, project_id TEXT NOT NULL, capability_id TEXT NOT NULL,
    version TEXT NOT NULL, reason TEXT NOT NULL, revoked_by TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, project_id, capability_id, version)
  );
  CREATE INDEX IF NOT EXISTS idx_gci_bindings_scope ON gci_project_bindings(organization_id, project_id);
  CREATE INDEX IF NOT EXISTS idx_gci_installations_scope ON gci_installations(organization_id, project_id, status);
  CREATE INDEX IF NOT EXISTS idx_gci_ledger_scope ON gci_event_ledger(organization_id, project_id, created_at);`);
}

module.exports = { migrateGciCapabilityInheritance };
