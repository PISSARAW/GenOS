'use strict';

const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

async function seed(db) {
  await db.exec(`
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE telemetry_events (
      id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT, severity TEXT,
      organization_id TEXT, project_id TEXT, created_at TEXT, payload_json TEXT
    );
    INSERT INTO workspaces VALUES ('wa', 'org-a', 'project-a');
    INSERT INTO workspaces VALUES ('wb', 'org-b', 'project-b');
    INSERT INTO agents VALUES ('agent-a', 'wa');
    INSERT INTO agents VALUES ('agent-b', 'wb');
    INSERT INTO telemetry_events VALUES ('event-a', 'agent-a', 'EVENT_A', 'info', 'org-a', 'project-a', '2026-10-14', '{}');
    INSERT INTO telemetry_events VALUES ('event-b', 'agent-a', 'EVENT_B', 'info', 'org-b', 'project-b', '2026-10-14', '{"secret":"B"}');
    INSERT INTO telemetry_events VALUES ('event-legacy-a', 'agent-a', 'LEGACY_A', 'info', NULL, NULL, '2026-10-13', '{}');
    INSERT INTO telemetry_events VALUES ('event-legacy-b', 'agent-b', 'LEGACY_B', 'info', NULL, NULL, '2026-10-13', '{}');
    INSERT INTO telemetry_events VALUES ('event-partial', 'agent-a', 'PARTIAL', 'info', 'org-b', NULL, '2026-10-12', '{}');
  `);
}

async function runTest() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  const databaseModule = require('../src/db');
  const originalGetDatabase = databaseModule.getDatabase;
  databaseModule.getDatabase = async () => db;
  try {
    await seed(db);
    const { getEvents } = require('../src/controllers/telemetryController');
    const response = { json(body) { this.body = body; } };
    await getEvents({ tenant: { organizationId: 'org-a', projectId: 'project-a' }, query: {} }, response);
    const ids = response.body.events.map((event) => event.id).sort();
    assert.deepEqual(ids, ['event-a', 'event-legacy-a']);
    assert.equal(response.body.events.some((event) => event.payload_json.includes('secret')), false);
  } finally {
    databaseModule.getDatabase = originalGetDatabase;
    await db.close();
  }
}

runTest().then(() => console.log('Telemetry tenant scope: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
