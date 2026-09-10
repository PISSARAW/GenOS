/**
 * Non-regression test for bug #7.6 (quarantine without exit).
 *
 * quarantine -> authorizeMission refuses with AGENT_QUARANTINED ->
 * releaseQuarantine -> authorizeMission accepts again.
 * Also covers: AGENT_UNQUARANTINED telemetry, idempotent second release
 * (QUARANTINE_STATE_CHANGED, no state clobbered), and the unquarantine alias.
 */
const assert = require('assert');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-only';
const fs = require('fs');
const path = require('path');
const safety = require('../src/services/primitiveHandlers/safety');
const authority = require('../src/services/agentAuthorityService');
const telemetry = require('../src/services/telemetryObserver');
const { getDatabase, closeDatabase } = require('../src/db');

async function run() {
  assert.equal(typeof safety.releaseQuarantine, 'function');
  assert.equal(typeof safety.unquarantine, 'function');

  const dbPath = path.resolve(__dirname, 'quarantine-release-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO workspaces (id, name, path, description) VALUES ('quarantine-ws', 'Quarantine WS', ?, 'quarantine tests')", __dirname);
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, isolation_mode) VALUES ('quarantine-orch', 'Quarantine Orchestrator', 'coordinator', 'idle', 'orchestrator', 'quarantine-ws', 'Branch')");
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id, isolation_mode) VALUES ('quarantine-worker', 'Quarantine Worker', 'implementation', 'running', 'worker', 'quarantine-ws', 'quarantine-orch', 'Branch')");

    const quarantined = await safety.quarantine({
      targetId: 'quarantine-worker', orchestratorId: 'quarantine-orch',
      workspaceId: 'quarantine-ws', reason: 'release-test suspicion'
    });
    assert.equal(quarantined.success, true);
    const held = await db.get("SELECT status, isolation_mode FROM agents WHERE id = 'quarantine-worker'");
    assert.equal(held.status, 'blocked');
    assert.equal(held.isolation_mode, 'Quarantine');

    await assert.rejects(
      () => authority.authorizeMission(db, 'quarantine-worker', 'quarantine-orch', 'quarantine-ws'),
      (error) => error.code === 'AGENT_QUARANTINED',
      'quarantined agent must be refused'
    );

    const releasedEvents = [];
    const listener = (event) => {
      if (event.eventType === 'AGENT_UNQUARANTINED') releasedEvents.push(event);
    };
    telemetry.on('telemetry', listener);
    try {
      const released = await safety.releaseQuarantine({
        targetId: 'quarantine-worker', orchestratorId: 'quarantine-orch',
        workspaceId: 'quarantine-ws', reason: 'cleared by review'
      });
      assert.equal(released.success, true);
      assert.equal(released.released, 'quarantine-worker');
    } finally {
      telemetry.removeListener('telemetry', listener);
    }
    assert.equal(releasedEvents.length, 1);
    assert.equal(releasedEvents[0].agentId, 'quarantine-worker');

    const freed = await db.get("SELECT status, isolation_mode FROM agents WHERE id = 'quarantine-worker'");
    assert.equal(freed.status, 'idle');
    assert.equal(freed.isolation_mode, 'None');

    const agent = await authority.authorizeMission(db, 'quarantine-worker', 'quarantine-orch', 'quarantine-ws');
    assert.equal(agent.id, 'quarantine-worker');

    const again = await safety.releaseQuarantine({
      targetId: 'quarantine-worker', orchestratorId: 'quarantine-orch', workspaceId: 'quarantine-ws'
    });
    assert.equal(again.success, false);
    assert.equal(again.code, 'QUARANTINE_STATE_CHANGED');
    const untouched = await db.get("SELECT status, isolation_mode FROM agents WHERE id = 'quarantine-worker'");
    assert.equal(untouched.status, 'idle');
    assert.equal(untouched.isolation_mode, 'None');

    const missing = await safety.releaseQuarantine({
      targetId: 'no-such-agent', orchestratorId: 'quarantine-orch', workspaceId: 'quarantine-ws'
    });
    assert.equal(missing.success, false);
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
  console.log('Quarantine release: all assertions passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
