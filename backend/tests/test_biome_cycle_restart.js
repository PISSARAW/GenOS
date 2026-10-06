'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const biome = require('../src/services/biomeCoordinationService');
const sessionTools = require('../src/services/topologySessionTools');

async function run() {
  const filename = path.join(os.tmpdir(), `genos-biome-cycle-${process.pid}-${Date.now()}.db`);
  let db = await open({ filename, driver: sqlite3.Database });
  try {
    const runtime = await biome.BiomeRuntime.create('Persist ecological cycles', {
      db, variant: 'persistent', persistenceKey: filename, maxTicks: 8
    });
    await runtime.step({ totalBudget: 100, tokenCost: 7, season: 1 });
    await runtime.step({ tokenCost: 3, season: 2 });
    const before = await biome.sessionSnapshot(runtime.sessionId, { db });
    assert.equal(before.revision, 2);
    await db.close();
    db = await open({ filename, driver: sqlite3.Database });
    const restored = await biome.BiomeRuntime.restore(runtime.sessionId, 'persistent', db);
    assert.equal(restored.tick, 2);
    assert.equal(restored.state.budgetUsed, 10);
    assert.equal(restored.history.length, 2);
    assert.equal(restored.maxTicks, 8);
    const third = await restored.step({ tokenCost: 4, season: 3 });
    assert.equal(third.tick, 3);
    assert.equal(third.revision, 3);
    const events = await db.all('SELECT revision FROM topology_session_events WHERE session_id = ? ORDER BY revision', runtime.sessionId);
    assert.deepEqual(events.map(e => e.revision), [1, 2, 3]);
    const viaMcp = await sessionTools.applyTopologyOperation(db, {
      session_id: runtime.sessionId, operation: 'run', max_ticks: 2, variant_input: { tokenCost: 2, season: 4 }
    });
    assert.equal(viaMcp.cycles.length, 2);
    assert.equal(viaMcp.tick, 5);
    assert.equal((await biome.sessionSnapshot(runtime.sessionId, { db })).ecologicalState.runtime.budgetUsed, 18);
    const newMission = await biome.BiomeRuntime.create('Next season mission', {
      db, variant: 'persistent', persistenceKey: filename, maxTicks: 3
    });
    assert.equal(newMission.tick, 0);
    assert.equal(newMission.state.budgetUsed, 0);
    await newMission.step({ totalBudget: 20, tokenCost: 1, season: 5 });
    assert.equal(newMission.state.budgetUsed, 1);
    await creationRollback(db, filename);
    console.log('Biome SQLite restart, event revisions, MCP continuation and mission budget isolation: PASS');
  } finally {
    await db.close();
    await fs.rm(filename, { force: true });
  }
}
async function creationRollback(db, persistenceKey) {
  const before = await db.get('SELECT COUNT(*) AS count FROM topology_sessions');
  await db.exec("CREATE TRIGGER biome_creation_rejected BEFORE UPDATE ON persistent_biome_environments BEGIN SELECT RAISE(ABORT, 'biome creation test rejection'); END;");
  try {
    await assert.rejects(() => biome.BiomeRuntime.create('Rejected season', {
      db, variant: 'persistent', persistenceKey
    }), /biome creation test rejection/);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM topology_sessions')).count, before.count);
  } finally {
    await db.exec('DROP TRIGGER biome_creation_rejected;');
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
