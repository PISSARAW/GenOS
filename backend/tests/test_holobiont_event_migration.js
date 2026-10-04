'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const store = require('../src/services/holobionte/holobiontStore');

async function installLegacyEventTable(db) {
  await db.exec(`
    DROP TRIGGER IF EXISTS holobiont_events_no_update;
    DROP TRIGGER IF EXISTS holobiont_events_no_delete;
    DROP INDEX IF EXISTS idx_holobiont_events_type_time;
    DROP INDEX IF EXISTS idx_holobiont_events_session;
    ALTER TABLE holobiont_events RENAME TO current_events;
    CREATE TABLE holobiont_events (
      event_id TEXT PRIMARY KEY, holobiont_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      event_type TEXT NOT NULL CHECK (event_type IN (
        'HOST_CREATED', 'CONSTITUTION_UPDATED', 'SYMBIONT_DISCOVERED',
        'SYMBIONT_ADMISSION_STARTED', 'SYMBIONT_ADMITTED', 'SYMBIONT_REJECTED',
        'SYMBIONT_QUARANTINED', 'SYMBIONT_SANCTIONED', 'SYMBIONT_EXPELLED',
        'SYMBIONT_DORMANT', 'RESOURCE_GRANTED', 'RESOURCE_REVOKED',
        'CAPABILITY_USED', 'CONTRIBUTION_VERIFIED', 'IMMUNE_REJECTION',
        'IMMUNE_OVERRIDE', 'VERTICAL_TRANSMISSION', 'HORIZONTAL_ACQUISITION'
      )),
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)), actor_id TEXT,
      occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (holobiont_id) REFERENCES holobiont_sessions(holobiont_id) ON DELETE CASCADE,
      UNIQUE (holobiont_id, revision)
    );
    INSERT INTO holobiont_events SELECT * FROM current_events;
    DROP TABLE current_events;
  `);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateHolobiontSessions(db);
  const session = await store.createSession(db, { hostId: 'legacy-host', missionId: 'legacy-mission', scope: 'MISSION' });
  await installLegacyEventTable(db);
  await migrateHolobiontSessions(db);
  await store.appendEvent(db, {
    holobiontId: session.holobiontId, expectedRevision: session.revision,
    eventType: 'ECOLOGICAL_CYCLE_COMPLETED', payload: { cycle: 1, diversity: 2 }
  });
  const restored = await store.getSession(db, session.holobiontId);
  assert.equal(restored.ecologicalState.cycle, 1);
  assert.equal(restored.events.length, 2);
  await db.close();
  console.log('Holobiont event constraint migration preserves legacy events and admits new runtime events.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
