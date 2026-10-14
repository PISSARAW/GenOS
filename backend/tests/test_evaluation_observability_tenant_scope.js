'use strict';

const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const databaseModule = require('../src/db');

async function createDatabase() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, model_tier TEXT,
      lineage_relation TEXT, parent_agent_id TEXT, status TEXT);
    CREATE TABLE telemetry_events (id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT,
      action TEXT, detail TEXT, severity TEXT, payload_json TEXT, created_at TEXT,
      organization_id TEXT, project_id TEXT);
    CREATE TABLE lineage_nodes (id TEXT, label TEXT, node_type TEXT, score REAL, visits INTEGER,
      state_summary TEXT, metadata TEXT, workspace_id TEXT, created_at TEXT);
    CREATE TABLE lineage_edges (id TEXT, source_node_id TEXT, target_node_id TEXT,
      edge_type TEXT, is_animated INTEGER);
    CREATE TABLE evaluation_runs (id TEXT, benchmark TEXT, result_json TEXT, brier_score REAL,
      agent_id TEXT, organization_id TEXT, project_id TEXT, created_at TEXT);
    CREATE TABLE provenance_records (id TEXT, subject_type TEXT, subject_id TEXT,
      payload_hash TEXT, parent_hash TEXT, algorithm TEXT, created_at TEXT,
      organization_id TEXT, project_id TEXT);
    CREATE TABLE notification_preferences (event_type TEXT, enabled INTEGER, channels_json TEXT,
      organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('wa', 'org-a', 'project-a'), ('wb', 'org-b', 'project-b');
    INSERT INTO agents VALUES ('agent-a', 'wa', 'A', 'standard', NULL, NULL, 'idle');
    INSERT INTO agents VALUES ('agent-b', 'wb', 'B', 'standard', NULL, NULL, 'idle');
    INSERT INTO telemetry_events VALUES
      ('event-a', 'agent-a', 'AGENT_MESSAGE', 'send', 'A event', 'info', '{"message":"A visible"}', '2026-10-14', 'org-a', 'project-a'),
      ('event-b', 'agent-a', 'AGENT_MESSAGE', 'send', 'B event', 'info', '{"message":"tenant B secret"}', '2026-10-15', 'org-b', 'project-b'),
      ('event-legacy-a', 'agent-a', 'MESSAGE_SENT', 'send', 'legacy A event', 'info', '{"message":"legacy visible"}', '2026-10-13', NULL, NULL),
      ('event-partial', 'agent-a', 'TOOL_CALL_COMPLETED', 'call', 'partial scope', 'info', '{"message":"partial secret"}', '2026-10-16', 'org-b', NULL),
      ('event-legacy-b', 'agent-b', 'AGENT_MESSAGE', 'send', 'legacy B event', 'info', '{"message":"other workspace"}', '2026-10-12', NULL, NULL);
  `);
  return db;
}

async function run() {
  const db = await createDatabase();
  const originalGetDatabase = databaseModule.getDatabase;
  databaseModule.getDatabase = async () => db;
  const observability = require('../src/services/evaluationObservabilityService');
  try {
    const result = await observability.overview({ organizationId: 'org-a', projectId: 'project-a' });
    const messages = result.swarm.messages;
    assert.deepEqual(messages.map((event) => event.id).sort(), ['event-a', 'event-legacy-a']);
    assert.equal(JSON.stringify(messages).includes('tenant B secret'), false);
    assert.equal(JSON.stringify(messages).includes('partial secret'), false);
    const snakeCase = await observability.overview({ organization_id: 'org-a', project_id: 'project-a' });
    assert.deepEqual(snakeCase.swarm.messages.map((event) => event.id).sort(), ['event-a', 'event-legacy-a']);
  } finally {
    databaseModule.getDatabase = originalGetDatabase;
    await db.close();
  }
}

run().then(() => console.log('Evaluation observability tenant scope: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
