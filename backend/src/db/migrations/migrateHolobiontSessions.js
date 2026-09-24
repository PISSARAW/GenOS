'use strict';

async function migrateHolobiontSessions(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS holobiont_sessions (
      holobiont_id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      mission_id TEXT,
      constitution_id TEXT,
      scope TEXT NOT NULL CHECK (scope IN ('MISSION', 'WORKSPACE', 'PROJECT', 'PERSISTENT')),
      workspace_id TEXT,
      project_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'QUIESCENT', 'CLOSED', 'SUSPENDED')),
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      session_json TEXT NOT NULL CHECK (json_valid(session_json)),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (scope != 'MISSION' OR mission_id IS NOT NULL),
      CHECK (scope != 'WORKSPACE' OR workspace_id IS NOT NULL),
      CHECK (scope != 'PROJECT' OR project_id IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_holobiont_sessions_host_scope
      ON holobiont_sessions(host_id, scope, status);
    CREATE INDEX IF NOT EXISTS idx_holobiont_sessions_mission
      ON holobiont_sessions(mission_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_holobiont_sessions_project
      ON holobiont_sessions(project_id, status);

    CREATE TABLE IF NOT EXISTS holobiont_mission_links (
      holobiont_id TEXT NOT NULL REFERENCES holobiont_sessions(holobiont_id) ON DELETE CASCADE,
      host_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      attached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (holobiont_id, mission_id)
    );
    CREATE INDEX IF NOT EXISTS idx_holobiont_mission_links_host
      ON holobiont_mission_links(host_id, attached_at);

    CREATE TABLE IF NOT EXISTS holobiont_events (
      event_id TEXT PRIMARY KEY,
      holobiont_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      event_type TEXT NOT NULL CHECK (event_type IN (
        'HOST_CREATED', 'CONSTITUTION_UPDATED', 'SYMBIONT_DISCOVERED',
        'SYMBIONT_ADMISSION_STARTED', 'SYMBIONT_ADMITTED', 'SYMBIONT_REJECTED',
        'SYMBIONT_QUARANTINED', 'SYMBIONT_SANCTIONED', 'SYMBIONT_EXPELLED',
        'SYMBIONT_DORMANT', 'RESOURCE_GRANTED', 'RESOURCE_REVOKED',
        'CAPABILITY_USED', 'CONTRIBUTION_VERIFIED', 'IMMUNE_REJECTION',
        'IMMUNE_OVERRIDE', 'VERTICAL_TRANSMISSION', 'HORIZONTAL_ACQUISITION'
      )),
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      actor_id TEXT,
      occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (holobiont_id) REFERENCES holobiont_sessions(holobiont_id) ON DELETE CASCADE,
      UNIQUE (holobiont_id, revision)
    );

    CREATE INDEX IF NOT EXISTS idx_holobiont_events_type_time
      ON holobiont_events(event_type, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_holobiont_events_session
      ON holobiont_events(holobiont_id, revision);

    CREATE TRIGGER IF NOT EXISTS holobiont_events_no_update
      BEFORE UPDATE ON holobiont_events
      BEGIN SELECT RAISE(ABORT, 'holobiont_events is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS holobiont_events_no_delete
      BEFORE DELETE ON holobiont_events
      BEGIN SELECT RAISE(ABORT, 'holobiont_events is append-only'); END;
  `);
}

module.exports = { migrateHolobiontSessions };
