'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGarageFabric } = require('../src/db/migrations/migrateGarageFabric');

async function open(filename) {
  const db = await sqlite.open({ filename, driver: sqlite3.Database });
  await db.exec('PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL;');
  return db;
}

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-garage-'));
  const filename = path.join(directory, 'queue.sqlite');
  const db = await open(filename);
  await db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY, path TEXT, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents(id TEXT PRIMARY KEY, name TEXT, role TEXT, execution_mode TEXT, status TEXT,
      workspace_id TEXT, parent_agent_id TEXT, metadata_json TEXT DEFAULT '{}', is_apoptotic INTEGER DEFAULT 0,
      isolation_mode TEXT DEFAULT 'Branch', about TEXT, current_task TEXT, runtime_pid INTEGER, runtime_executable TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE strategy_execution_runs(id TEXT PRIMARY KEY, agent_id TEXT, status TEXT,
      metrics_json TEXT DEFAULT '{}', budget_json TEXT DEFAULT '{}');
    CREATE TABLE telemetry_events(id INTEGER PRIMARY KEY, agent_id TEXT, event_type TEXT, payload_json TEXT);
    CREATE TABLE agent_capsule_cleanup(agent_id TEXT PRIMARY KEY, workspace_root TEXT);
    CREATE TABLE signal_deliveries(signal_id TEXT, subscriber_agent_id TEXT, status TEXT);
    CREATE TABLE signal_blobs(signal_id TEXT, signal_type TEXT, signal_blob TEXT, content TEXT, topic TEXT,
      sender_agent_id TEXT, created_at TEXT, expires_at TEXT);
    CREATE TABLE signal_delivery_claims(signal_id TEXT, subscriber_agent_id TEXT, lease_until_ms INTEGER,
      next_attempt_at_ms INTEGER, dead_lettered_at_ms INTEGER);
    CREATE TABLE workspace_snapshots(id TEXT PRIMARY KEY, workspace_id TEXT, snapshot_hash TEXT, step_number INTEGER,
      label TEXT, author TEXT, reason TEXT, diff_summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  await migrateGarageFabric(db);
  await migrateGarageFabric(db);
  await db.run("INSERT INTO workspaces VALUES ('ws', ?, 'org', 'project')", directory);
  await db.run("INSERT INTO agents(id,name,role,execution_mode,status,workspace_id) VALUES ('orch','Parent','orchestrator','orchestrator','running','ws')");
  for (let index = 1; index <= 6; index++) {
    await db.run(`INSERT INTO agents(id,name,role,execution_mode,status,workspace_id,parent_agent_id)
      VALUES (?, ?, 'implementation','worker','idle','ws','orch')`, `worker-${index}`, `Worker ${index}`);
  }
  process.env.GENOS_DB_PATH = filename;
  process.env.GENOS_DB_BOOTSTRAP_SKIP = '1';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  process.env.GENOS_WORKSPACE_ROOT = directory;
  return { db, filename, directory, close: async () => {
    await require('../src/db').closeDatabase();
    await db.close();
    await fs.rm(directory, { recursive: true, force: true });
  } };
}

function request(patch = {}) {
  return { orchestratorId: 'orch', workerId: 'worker-1', prompt: 'Compute a bounded result', mode: 'surface', ...patch };
}

module.exports = { fixture, open, request };
