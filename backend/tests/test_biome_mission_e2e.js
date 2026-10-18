'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const biome = require('../src/services/biomeCoordinationService');
const { runBiomeMission } = require('../src/services/biome/biomeMissionLoop');

async function tempDatabasePath() {
  return path.join(os.tmpdir(), `genos-biome-mission-e2e-${process.pid}-${Date.now()}.db`);
}

async function openDatabase(filename) {
  return open({ filename, driver: sqlite3.Database });
}

function missionBase() {
  return {
    budget: 100,
    capabilities: ['forage', 'allocate'],
    proposal: { patchHistory: [], cost: 10 },
    action: { populations: [{ id: 'alpha', demand: 1, priority: 1 }] },
    observations: [{ label: 'ok' }]
  };
}

async function run() {
  const filename = await tempDatabasePath();
  let db = await openDatabase(filename);
  try {
    const session = await biome.composeBiome('Biome E2E mission', { organization: 'energy_huddle', db });
    const before = await biome.sessionSnapshot(session.sessionId, { db });
    const receipt = await runBiomeMission(session.sessionId, Object.assign({}, missionBase(), { adapter: 'real' }), { db, authorize: () => true });
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.simulated, false);
    assert.deepEqual(receipt.steps.map((step) => step.step), ['observe', 'propose', 'constrain', 'act', 'verify']);
    const after = await biome.sessionSnapshot(session.sessionId, { db });
    assert.equal(after.revision, before.revision + 2);
    const events = await db.all('SELECT revision, event_type FROM topology_session_events WHERE session_id = ? ORDER BY revision', session.sessionId);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((event) => event.event_type), ['allocate', 'health']);

    await db.close();
    db = await openDatabase(filename);
    const restored = await biome.sessionSnapshot(session.sessionId, { db });
    assert.equal(restored.revision, after.revision);
    const restoredEvents = await db.all('SELECT revision FROM topology_session_events WHERE session_id = ? ORDER BY revision', session.sessionId);
    assert.equal(restoredEvents.length, 2);

    const simulatedSession = await biome.composeBiome('Biome E2E simulated', { organization: 'energy_huddle', db });
    const simulatedBefore = await biome.sessionSnapshot(simulatedSession.sessionId, { db });
    const simulatedReceipt = await runBiomeMission(simulatedSession.sessionId, Object.assign({}, missionBase(), { adapter: 'simulated' }), { db });
    assert.equal(simulatedReceipt.status, 'completed');
    assert.equal(simulatedReceipt.simulated, true);
    const simulatedAfter = await biome.sessionSnapshot(simulatedSession.sessionId, { db });
    assert.equal(simulatedAfter.revision, simulatedBefore.revision);

    const deniedSession = await biome.composeBiome('Biome E2E denied', { organization: 'energy_huddle', db });
    const deniedBefore = await biome.sessionSnapshot(deniedSession.sessionId, { db });
    const deniedReceipt = await runBiomeMission(deniedSession.sessionId, Object.assign({}, missionBase(), { adapter: 'real' }), { db, authorize: () => false });
    assert.equal(deniedReceipt.status, 'abstained');
    const deniedAfter = await biome.sessionSnapshot(deniedSession.sessionId, { db });
    assert.equal(deniedAfter.revision, deniedBefore.revision);

    const failedReceipt = await runBiomeMission(session.sessionId, Object.assign({}, missionBase(), { budget: -1 }), { db });
    assert.equal(failedReceipt.status, 'failed');
    assert.equal(failedReceipt.steps.length, 0);

    console.log('Biome mission E2E: real receipts, SQLite restart, simulated no-effect and authorization boundary passed.');
  } finally {
    await db.close();
    await fs.rm(filename, { force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});