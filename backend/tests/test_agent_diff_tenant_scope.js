'use strict';

const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

async function seed(db) {
  await db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (
      id TEXT PRIMARY KEY, workspace_id TEXT, parent_agent_id TEXT, name TEXT, name_meaning TEXT,
      role TEXT, agent_type TEXT, execution_mode TEXT, model_tier TEXT, language TEXT,
      lineage_relation TEXT, status TEXT, is_apoptotic INTEGER, cognitive_budget REAL,
      cognitive_baseline_budget REAL, dissonance_level REAL, eureka_count INTEGER, created_at TEXT
    );
    CREATE TABLE genome_decisions (id TEXT, created_by TEXT, organization_id TEXT, project_id TEXT);
    CREATE TABLE strategy_contracts (id TEXT, agent_id TEXT, workspace_id TEXT);
    CREATE TABLE strategy_execution_runs (id TEXT, agent_id TEXT, contract_id TEXT);
    CREATE TABLE telemetry_events (id TEXT, agent_id TEXT, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('wa', 'org-a', 'project-a');
    INSERT INTO workspaces VALUES ('wb', 'org-b', 'project-b');
    INSERT INTO agents VALUES ('left', 'wa', NULL, 'Left', '', 'worker', 'GenOS', 'worker', 'standard', 'TypeScript', 'fork', 'idle', 0, 80, 100, 2, 1, '2026-10-14');
    INSERT INTO agents VALUES ('right', 'wa', NULL, 'Right', '', 'worker', 'GenOS', 'worker', 'standard', 'TypeScript', 'fork', 'idle', 0, 80, 100, 2, 1, '2026-10-14');
    INSERT INTO agents VALUES ('left-child-a', 'wa', 'left', 'Child A', '', 'worker', 'GenOS', 'worker', 'standard', 'TypeScript', 'child', 'idle', 0, 80, 100, 2, 1, '2026-10-14');
    INSERT INTO agents VALUES ('left-child-b', 'wb', 'left', 'Child B', '', 'worker', 'GenOS', 'worker', 'standard', 'TypeScript', 'child', 'idle', 0, 80, 100, 2, 1, '2026-10-14');
    INSERT INTO agents VALUES ('right-child-a', 'wa', 'right', 'Child A', '', 'worker', 'GenOS', 'worker', 'standard', 'TypeScript', 'child', 'idle', 0, 80, 100, 2, 1, '2026-10-14');
    INSERT INTO genome_decisions VALUES ('decision-left-a', 'left', 'org-a', 'project-a');
    INSERT INTO genome_decisions VALUES ('decision-left-b', 'left', 'org-b', 'project-b');
    INSERT INTO genome_decisions VALUES ('decision-right-a', 'right', 'org-a', 'project-a');
    INSERT INTO strategy_contracts VALUES ('contract-left-a', 'left', 'wa');
    INSERT INTO strategy_contracts VALUES ('contract-left-b', 'left', 'wb');
    INSERT INTO strategy_contracts VALUES ('contract-right-a', 'right', 'wa');
    INSERT INTO strategy_execution_runs VALUES ('run-left-a', 'left', 'contract-left-a');
    INSERT INTO strategy_execution_runs VALUES ('run-left-b', 'left', 'contract-left-b');
    INSERT INTO strategy_execution_runs VALUES ('run-right-a', 'right', 'contract-right-a');
    INSERT INTO telemetry_events VALUES ('event-left-a', 'left', 'org-a', 'project-a');
    INSERT INTO telemetry_events VALUES ('event-left-b', 'left', 'org-b', 'project-b');
    INSERT INTO telemetry_events VALUES ('event-right-a', 'right', 'org-a', 'project-a');
  `);
}

async function runTest() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  const dbModule = require('../src/db');
  const originalGetDatabase = dbModule.getDatabase;
  dbModule.getDatabase = async () => db;
  try {
    await seed(db);
    delete require.cache[require.resolve('../src/controllers/lineageController')];
    const { diffAgents } = require('../src/controllers/lineageController');
    const response = { json(body) { this.body = body; } };
    await diffAgents({
      body: { leftAgentId: 'left', rightAgentId: 'right' },
      tenant: { organizationId: 'org-a', projectId: 'project-a' }
    }, response);
    assert.equal(response.body.left.activity.decisions, 1);
    assert.equal(response.body.left.activity.executionRuns, 1);
    assert.equal(response.body.left.activity.telemetryEvents, 1);
    assert.equal(response.body.left.activity.directChildren, 1);
    assert.deepEqual(response.body.left.activity, response.body.right.activity);
  } finally {
    dbModule.getDatabase = originalGetDatabase;
    await db.close();
  }
}

runTest().then(() => console.log('Agent diff tenant scope: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
