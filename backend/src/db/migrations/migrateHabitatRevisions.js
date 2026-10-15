'use strict';

async function migrateHabitatRevisions(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS habitat_revisions (
    habitat_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision > 0),
    previous_hash TEXT,
    content_hash TEXT NOT NULL,
    configuration_json TEXT NOT NULL CHECK(json_valid(configuration_json)),
    organization_id TEXT,
    project_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(habitat_id, revision)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_habitat_revision_hash
    ON habitat_revisions(habitat_id, content_hash);
  CREATE INDEX IF NOT EXISTS idx_habitat_revision_tenant
    ON habitat_revisions(organization_id, project_id, habitat_id, revision);
  CREATE TABLE IF NOT EXISTS mission_habitat_bindings (
    mission_id TEXT PRIMARY KEY,
    habitat_id TEXT NOT NULL,
    habitat_revision INTEGER NOT NULL,
    binding_hash TEXT NOT NULL,
    organization_id TEXT,
    project_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(habitat_id, habitat_revision)
      REFERENCES habitat_revisions(habitat_id, revision)
  );
  CREATE INDEX IF NOT EXISTS idx_mission_habitat_tenant
    ON mission_habitat_bindings(organization_id, project_id, mission_id);
  CREATE TRIGGER IF NOT EXISTS habitat_revision_no_update
    BEFORE UPDATE ON habitat_revisions
    BEGIN SELECT RAISE(ABORT, 'Immutable habitat revision'); END;
  CREATE TRIGGER IF NOT EXISTS habitat_revision_no_delete
    BEFORE DELETE ON habitat_revisions
    BEGIN SELECT RAISE(ABORT, 'Immutable habitat revision'); END;
  CREATE TRIGGER IF NOT EXISTS mission_habitat_binding_no_update
    BEFORE UPDATE ON mission_habitat_bindings
    BEGIN SELECT RAISE(ABORT, 'Immutable mission habitat binding'); END;
  CREATE TRIGGER IF NOT EXISTS mission_habitat_binding_no_delete
    BEFORE DELETE ON mission_habitat_bindings
    BEGIN SELECT RAISE(ABORT, 'Immutable mission habitat binding'); END;`);
}

module.exports = { migrateHabitatRevisions };
