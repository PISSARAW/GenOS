'use strict';

const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const agentGit = require('../src/services/agentGitService');

async function seed(db) {
  await db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (
      id TEXT PRIMARY KEY, workspace_id TEXT, parent_agent_id TEXT, name TEXT, role TEXT,
      status TEXT, lineage_relation TEXT, created_at TEXT
    );
    CREATE TABLE genome_decisions (
      id TEXT, title TEXT, content TEXT, cart_nodes_json TEXT, category TEXT, synaptic_weight REAL,
      organization_id TEXT, project_id TEXT, created_by TEXT, created_at TEXT
    );
    CREATE TABLE episodic_memories (id TEXT, agent_id TEXT, organization_id TEXT, project_id TEXT, created_at TEXT);
    CREATE TABLE strategy_contracts (id TEXT, agent_id TEXT, workspace_id TEXT);
    CREATE TABLE strategy_execution_runs (
      id TEXT, agent_id TEXT, contract_id TEXT, contract_version INTEGER, status TEXT,
      budget_json TEXT, metrics_json TEXT, created_at TEXT
    );
    CREATE TABLE plasmid_bindings (
      plasmid_id TEXT, owner_agent_id TEXT, organization_id TEXT, project_id TEXT, created_at TEXT
    );
    CREATE TABLE agent_permissions (
      agent_id TEXT, permissions_json TEXT, denied_tools_json TEXT, organization_id TEXT, project_id TEXT
    );
    CREATE TABLE telemetry_events (
      id TEXT, event_id TEXT, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT,
      payload_json TEXT, severity TEXT, organization_id TEXT, project_id TEXT, created_at TEXT
    );
    INSERT INTO workspaces VALUES ('wa', 'org-a', 'project-a');
    INSERT INTO workspaces VALUES ('wb', 'org-b', 'project-b');
    INSERT INTO agents VALUES ('agent-a', 'wa', NULL, 'A', 'worker', 'idle', 'independent', '2026-10-14');
    INSERT INTO agents VALUES ('child-a', 'wa', 'agent-a', 'child A', 'worker', 'idle', 'child', '2026-10-14');
    INSERT INTO agents VALUES ('child-b', 'wb', 'agent-a', 'child B', 'worker', 'idle', 'child', '2026-10-14');
    INSERT INTO genome_decisions VALUES ('decision-a', 'A', 'A', '[]', 'test', 1, 'org-a', 'project-a', 'agent-a', '2026-10-14');
    INSERT INTO genome_decisions VALUES ('decision-b', 'B', 'secret B', '[]', 'test', 1, 'org-b', 'project-b', 'agent-a', '2026-10-14');
    INSERT INTO genome_decisions VALUES ('decision-legacy', 'legacy', 'legacy', '[]', 'test', 1, NULL, NULL, 'agent-a', '2026-10-13');
    INSERT INTO episodic_memories VALUES ('memory-a', 'agent-a', 'org-a', 'project-a', '2026-10-14');
    INSERT INTO episodic_memories VALUES ('memory-b', 'agent-a', 'org-b', 'project-b', '2026-10-14');
    INSERT INTO episodic_memories VALUES ('memory-legacy', 'agent-a', NULL, NULL, '2026-10-13');
    INSERT INTO strategy_contracts VALUES ('contract-a', 'agent-a', 'wa');
    INSERT INTO strategy_contracts VALUES ('contract-b', 'agent-a', 'wb');
    INSERT INTO strategy_contracts VALUES ('contract-legacy', 'agent-a', NULL);
    INSERT INTO strategy_execution_runs VALUES ('run-a', 'agent-a', 'contract-a', 1, 'completed', '{}', '{}', '2026-10-14');
    INSERT INTO strategy_execution_runs VALUES ('run-b', 'agent-a', 'contract-b', 1, 'completed', '{}', '{}', '2026-10-14');
    INSERT INTO strategy_execution_runs VALUES ('run-legacy', 'agent-a', 'contract-legacy', 1, 'completed', '{}', '{}', '2026-10-13');
    INSERT INTO plasmid_bindings VALUES ('plasmid-a', 'agent-a', 'org-a', 'project-a', '2026-10-14');
    INSERT INTO plasmid_bindings VALUES ('plasmid-b', 'agent-a', 'org-b', 'project-b', '2026-10-14');
    INSERT INTO plasmid_bindings VALUES ('plasmid-legacy', 'agent-a', NULL, NULL, '2026-10-13');
    INSERT INTO agent_permissions VALUES ('agent-a', '[]', '[]', 'org-a', 'project-a');
    INSERT INTO agent_permissions VALUES ('agent-a', '["secret-b"]', '[]', 'org-b', 'project-b');
    INSERT INTO telemetry_events VALUES ('event-a', 'event-a', 'agent-a', 'A', 'A', 'A', '{}', 'info', 'org-a', 'project-a', '2026-10-14');
    INSERT INTO telemetry_events VALUES ('event-b', 'event-b', 'agent-a', 'B', 'B', 'secret B', '{}', 'info', 'org-b', 'project-b', '2026-10-14');
    INSERT INTO telemetry_events VALUES ('event-legacy', 'event-legacy', 'agent-a', 'LEGACY', 'legacy', 'legacy', '{}', 'info', NULL, NULL, '2026-10-13');
  `);
}

async function runTest() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await seed(db);
    const state = await agentGit.collectState(db, {
      tenant: { organizationId: 'org-a', projectId: 'project-a' }
    }, 'agent-a');
    assert.deepEqual(state.decisions.map((row) => row.id).sort(), ['decision-a', 'decision-legacy']);
    assert.deepEqual(state.memories.map((row) => row.id).sort(), ['memory-a', 'memory-legacy']);
    assert.deepEqual(state.runs.map((row) => row.id).sort(), ['run-a', 'run-legacy']);
    assert.deepEqual(state.plasmids.map((row) => row.plasmid_id).sort(), ['plasmid-a', 'plasmid-legacy']);
    assert.deepEqual(state.permissions.map((row) => row.organization_id), ['org-a']);
    assert.deepEqual(state.events.map((row) => row.event_id).sort(), ['event-a', 'event-legacy']);
    assert.deepEqual(state.children.map((row) => row.id), ['child-a']);
    assert.equal(JSON.stringify(state).includes('secret B'), false);
  } finally {
    await db.close();
  }
}

runTest().then(() => console.log('Agent Git tenant scope: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
