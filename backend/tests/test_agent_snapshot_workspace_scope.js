'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const dbModule = require('../src/db');

function response() {
  let result;
  return {
    res: { status: (code) => ({ json: (body) => { result = { code, body }; } }),
      json: (body) => { result = { code: 200, body }; } },
    get: () => result
  };
}

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT, organization_id TEXT, project_id TEXT,
      name TEXT, name_meaning TEXT, role TEXT, model_tier TEXT, language TEXT, isolation_mode TEXT,
      dissonance_level INTEGER, eureka_count INTEGER, cognitive_budget INTEGER,
      cognitive_baseline_budget INTEGER, cognitive_max_dissonance INTEGER, is_apoptotic INTEGER,
      status TEXT, current_task TEXT, updated_at TEXT);
    CREATE TABLE agent_state_snapshots (id TEXT PRIMARY KEY, agent_id TEXT, workspace_id TEXT,
      state_json TEXT, reason TEXT, commit_message TEXT, parent_snapshot_id TEXT,
      ref_name TEXT, created_by TEXT, created_at TEXT);
    INSERT INTO workspaces VALUES ('workspace-a', 'org-a', 'project-a');
    INSERT INTO workspaces VALUES ('workspace-b', 'org-b', 'project-b');
    INSERT INTO agents (id, workspace_id, organization_id, project_id, current_task)
      VALUES ('agent-a', 'workspace-a', 'org-a', 'project-a', 'A safe task');
    INSERT INTO agents (id, workspace_id, organization_id, project_id, current_task)
      VALUES ('agent-target', 'workspace-a', 'org-a', 'project-a', 'Target safe task');
    INSERT INTO agent_state_snapshots VALUES
      ('snapshot-a1', 'agent-a', 'workspace-a', '{"current_task":"safe"}', 'safe', NULL, NULL, 'main', 'test', '2026-01-01'),
      ('snapshot-a2', 'agent-a', 'workspace-a', '{"current_task":"safe"}', 'safe', NULL, NULL, 'main', 'test', '2026-01-02'),
      ('snapshot-b', 'agent-a', 'workspace-b', '{"current_task":"B secret"}', 'foreign', NULL, NULL, 'main', 'test', '2026-01-03');`);
  return db;
}

async function testPreviewAndBisect(db, controller) {
  const tenant = { organizationId: 'org-a', projectId: 'project-a' };
  const replay = response();
  await controller.replayAgentState({ body: { agentId: 'agent-a', snapshotId: 'snapshot-b' }, tenant }, replay.res);
  assert.equal(replay.get().code, 404);
  assert.equal(JSON.stringify(replay.get()).includes('B secret'), false);

  const bisect = response();
  await controller.bisectAgentState({ body: { agentId: 'agent-a', field: 'current_task',
    expectedValue: 'safe' }, tenant }, bisect.res);
  assert.equal(bisect.get().body.anomalyFound, false);
  assert.notEqual(bisect.get().body.culpritSnapshotId, 'snapshot-b');
}

async function testSnapshotMutations(db, controller) {
  const tenant = { organizationId: 'org-a', projectId: 'project-a' };
  const calls = [
    ['branchAgentState', { agentId: 'agent-a', refName: 'foreign-branch', fromCommitId: 'snapshot-b' }],
    ['checkoutAgentState', { agentId: 'agent-a', snapshotId: 'snapshot-b' }],
    ['restoreAgentState', { agentId: 'agent-a', snapshotId: 'snapshot-b' }],
    ['inspectAgentRestore', { agentId: 'agent-a', snapshotId: 'snapshot-b' }],
    ['cherryPickAgentState', { sourceAgentId: 'agent-a', targetAgentId: 'agent-target', snapshotId: 'snapshot-b' }]
  ];
  for (const [name, body] of calls) {
    const result = response();
    await controller[name]({ body, tenant }, result.res);
    assert.equal(result.get().code, 404, `${name} must refuse a foreign-workspace snapshot`);
  }
  assert.equal((await db.get('SELECT current_task FROM agents WHERE id = ?', 'agent-target')).current_task,
    'Target safe task');
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM agent_state_snapshots WHERE ref_name = 'foreign-branch'")).count, 0);
}

async function run() {
  const db = await fixture();
  const originalDatabase = dbModule.getDatabase;
  dbModule.getDatabase = async () => db;
  delete require.cache[require.resolve('../src/controllers/lineageController')];
  const controller = require('../src/controllers/lineageController');
  try {
    await testPreviewAndBisect(db, controller);
    await testSnapshotMutations(db, controller);
  } finally {
    dbModule.getDatabase = originalDatabase;
    await db.close();
  }
}

run().then(() => console.log('Agent snapshot workspace scope: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
