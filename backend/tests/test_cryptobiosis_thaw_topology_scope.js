'use strict';

const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const databaseModule = require('../src/db');
const telemetry = require('../src/services/telemetryObserver');

async function makeDb() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, parent_agent_id TEXT, workspace_id TEXT,
      status TEXT, current_task TEXT, updated_at TEXT);
    CREATE TABLE cryptobiosis_snapshots (id TEXT PRIMARY KEY, snapshot_id TEXT,
      workspace_id TEXT, reason TEXT, frozen_at TEXT, state_json TEXT, status TEXT,
      thawed_at TEXT, thawed_by TEXT);
    INSERT INTO workspaces VALUES ('wa', 'org', 'project'), ('wb', 'org', 'project'), ('wc', 'org', 'project');
    INSERT INTO agents VALUES ('parent', NULL, 'wb', 'hibernating', 'parent task', NULL);
    INSERT INTO agents VALUES ('worker', 'parent', 'wa', 'hibernating', 'worker task', NULL);
    INSERT INTO cryptobiosis_snapshots VALUES ('legacy-snap-1', 'snap-1', 'wa', 'freeze', '2026-10-14',
      '{"agents":[{"id":"worker","status":"running","currentTask":"resume"}]}', 'frozen', NULL, NULL);
  `);
  return db;
}

async function invoke(controller, snapshotId) {
  let responseBody;
  let statusCode;
  let caught;
  const res = { status(value) { statusCode = value; return this; }, json(value) { responseBody = value; return this; } };
  await controller.thawCryptobiosis({ tenant: { organizationId: 'org', projectId: 'project' },
    user: { username: 'operator' }, body: { snapshotId, targetWorkspaceId: 'wc' } }, res,
  (error) => { caught = error; });
  return { responseBody, statusCode, caught };
}

async function run() {
  const db = await makeDb();
  const originalGetDatabase = databaseModule.getDatabase;
  const originalEmit = telemetry.emitEvent;
  databaseModule.getDatabase = async () => db;
  telemetry.emitEvent = () => ({ id: 'fixture-event' });
  try {
    const controller = require('../src/controllers/resilienceController');
    const conflict = await invoke(controller, 'snap-1');
    assert.equal(conflict.caught.code, 'CRYPTOBIOSIS_TOPOLOGY_SCOPE_CONFLICT');
    assert.equal((await db.get('SELECT workspace_id, status FROM agents WHERE id = ?', 'worker')).workspace_id, 'wa');
    assert.equal((await db.get('SELECT thawed_at FROM cryptobiosis_snapshots WHERE snapshot_id = ?', 'snap-1')).thawed_at, null);

    await db.run("INSERT INTO cryptobiosis_snapshots VALUES ('legacy-snap-2', 'snap-2', 'wa', 'freeze', '2026-10-14', '{\"agents\":[{\"id\":\"parent\",\"status\":\"running\",\"currentTask\":\"resume\"}]}', 'frozen', NULL, NULL)");
    await db.run("UPDATE agents SET workspace_id = 'wa' WHERE id = 'parent'");
    await db.run("INSERT INTO agents VALUES ('late-child', 'parent', 'wa', 'hibernating', 'new child', NULL)");
    const lateChildConflict = await invoke(controller, 'snap-2');
    assert.equal(lateChildConflict.caught.code, 'CRYPTOBIOSIS_TOPOLOGY_SCOPE_CONFLICT');
    assert.equal((await db.get('SELECT workspace_id FROM agents WHERE id = ?', 'parent')).workspace_id, 'wa');
    assert.equal((await db.get('SELECT workspace_id FROM agents WHERE id = ?', 'late-child')).workspace_id, 'wa');
    assert.equal((await db.get('SELECT status, thawed_at FROM cryptobiosis_snapshots WHERE snapshot_id = ?', 'snap-2')).status, 'frozen');

    await db.run("INSERT INTO cryptobiosis_snapshots VALUES ('legacy-snap-stale', 'snap-stale', 'wa', 'freeze', '2026-10-14', '{\"agents\":[]}', 'thawed', '2026-10-14', 'operator')");
    const stale = await invoke(controller, 'snap-stale');
    assert.equal(stale.statusCode, 404);
    assert.equal(stale.responseBody.error.code, 'SNAPSHOT_NOT_FOUND');
    const alias = await invoke(controller, 'legacy-snap-1');
    assert.equal(alias.statusCode, 404);

    await db.run("UPDATE agents SET parent_agent_id = NULL WHERE id = 'worker'");
    await db.run(`INSERT INTO cryptobiosis_snapshots VALUES ('snap-3', 'other-snapshot', 'wa', 'freeze', '2026-10-14',
      '{"agents":[]}', 'frozen', NULL, NULL)`);
    await db.run(`INSERT INTO cryptobiosis_snapshots VALUES ('legacy-snap-3', 'snap-3', 'wa', 'freeze', '2026-10-14',
      '{"agents":[{"id":"parent","status":"running","currentTask":"parent resumed"},{"id":"late-child","status":"running","currentTask":"child resumed"}]}', 'frozen', NULL, NULL)`);
    const success = await invoke(controller, 'snap-3');
    assert.equal(success.caught, undefined);
    assert.equal(success.statusCode, 200);
    assert.deepEqual((await db.all('SELECT id, workspace_id FROM agents ORDER BY id')).map(({ id, workspace_id }) => [id, workspace_id]),
      [['late-child', 'wc'], ['parent', 'wc'], ['worker', 'wa']]);
    const thawed = await db.get('SELECT status, thawed_at FROM cryptobiosis_snapshots WHERE snapshot_id = ?', 'snap-3');
    assert.equal(thawed.status, 'thawed');
    assert.ok(thawed.thawed_at);
    assert.deepEqual(await db.get('SELECT status, thawed_at FROM cryptobiosis_snapshots WHERE snapshot_id = ?', 'other-snapshot'),
      { status: 'frozen', thawed_at: null });
  } finally {
    databaseModule.getDatabase = originalGetDatabase;
    telemetry.emitEvent = originalEmit;
    await db.close();
  }
}

run().then(() => console.log('Cryptobiosis thaw topology scope: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
