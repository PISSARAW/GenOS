'use strict';

const { EVENT_TYPES } = require('../../services/holobionte/constants');

const LEGACY_EVENT_TYPES = [
  'HOST_CREATED', 'CONSTITUTION_UPDATED', 'SYMBIONT_DISCOVERED',
  'SYMBIONT_ADMISSION_STARTED', 'SYMBIONT_ADMITTED', 'SYMBIONT_REJECTED',
  'SYMBIONT_QUARANTINED', 'SYMBIONT_SANCTIONED', 'SYMBIONT_EXPELLED',
  'SYMBIONT_DORMANT', 'RESOURCE_GRANTED', 'RESOURCE_REVOKED',
  'CAPABILITY_USED', 'CONTRIBUTION_VERIFIED', 'IMMUNE_REJECTION',
  'IMMUNE_OVERRIDE', 'VERTICAL_TRANSMISSION', 'HORIZONTAL_ACQUISITION'
];

async function migrateHolobiontVariantEvents(db) {
  const table = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'holobiont_events'");
  if (!table) return;
  const schema = String(table.sql || '');
  if (schema.includes("'VARIANT_SELECTED'") && schema.includes("'VARIANT_RUNTIME_EVALUATED'")) return;

  const allowed = [...new Set([...LEGACY_EVENT_TYPES, ...EVENT_TYPES])]
    .map((eventType) => `'${eventType.replace(/'/g, "''")}'`).join(', ');
  await db.exec('BEGIN IMMEDIATE;');
  try {
    await db.exec(`
      CREATE TABLE holobiont_events_variant_migration (
        event_id TEXT PRIMARY KEY,
        holobiont_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        event_type TEXT NOT NULL CHECK (event_type IN (${allowed})),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        actor_id TEXT,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (holobiont_id) REFERENCES holobiont_sessions(holobiont_id) ON DELETE CASCADE,
        UNIQUE (holobiont_id, revision)
      );
      INSERT INTO holobiont_events_variant_migration
        (event_id, holobiont_id, revision, event_type, payload_json, actor_id, occurred_at)
      SELECT event_id, holobiont_id, revision, event_type, payload_json, actor_id, occurred_at
      FROM holobiont_events;
      DROP TABLE holobiont_events;
      ALTER TABLE holobiont_events_variant_migration RENAME TO holobiont_events;
      CREATE INDEX idx_holobiont_events_type_time ON holobiont_events(event_type, occurred_at);
      CREATE INDEX idx_holobiont_events_session ON holobiont_events(holobiont_id, revision);
      CREATE TRIGGER holobiont_events_no_update BEFORE UPDATE ON holobiont_events
        BEGIN SELECT RAISE(ABORT, 'holobiont_events is append-only'); END;
      CREATE TRIGGER holobiont_events_no_delete BEFORE DELETE ON holobiont_events
        BEGIN SELECT RAISE(ABORT, 'holobiont_events is append-only'); END;
    `);
    await db.exec('COMMIT;');
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  }
}

module.exports = { migrateHolobiontVariantEvents };
