require('./naturalSearchTestTelemetry');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const runtime = require('../../src/services/search/naturalSearchRuntime');

async function openFixture(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,
      organization_id TEXT DEFAULT 'test-org', project_id TEXT DEFAULT 'test-project');`);
  for (const id of ['source', 'receiver', 'concurrent', 'crash']) {
    await db.run('INSERT OR IGNORE INTO agents(id) VALUES (?)', id);
  }
  await runtime.initializeNaturalSearchRuntime(db);
  return db;
}

async function send(db, args) {
  const { agentId = 'source', type = 'AGENT_STEP', payload = {}, action = 'inspect' } = args;
  const stop = await runtime.checkNaturalSearchControl({ db, agentId, budgetRatio: args.budgetRatio }, { eventType: type, action, payload });
  require('node:assert/strict').equal(stop, false, `Runtime rejected ${type}`);
  return runtime.getOrCreateSearchState(agentId, db);
}

module.exports = { openFixture, send, runtime };
