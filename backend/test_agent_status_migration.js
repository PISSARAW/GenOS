const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { initializeSchema } = require('./src/db/schema');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-agent-status-'));
  const filename = path.join(directory, 'genos.db');
  const db = await open({ filename, driver: sqlite3.Database });

  try {
    // This is the agents table used by already-created GenOS databases, before
    // the blocked lifecycle state was included in its CHECK constraint.
    await db.exec(`CREATE TABLE agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'error', 'terminated', 'apoptosis', 'Active', 'Apoptosis')),
      agent_type TEXT NOT NULL DEFAULT 'GenOS', execution_mode TEXT NOT NULL DEFAULT 'orchestrator',
      workspace_id TEXT, fleet_id TEXT, hallucination_monitoring INTEGER NOT NULL DEFAULT 0,
      hallucination_count INTEGER NOT NULL DEFAULT 0, model_tier TEXT DEFAULT 'Flash',
      language TEXT DEFAULT 'TypeScript', isolation_mode TEXT DEFAULT 'Branch', parent_agent_id TEXT,
      lineage_relation TEXT DEFAULT 'independent', about TEXT, current_task TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO agents (id, name, role, status) VALUES ('agent-existing', 'Existing agent', 'Worker', 'idle');`);

    await initializeSchema(db);
    await db.run("UPDATE agents SET status = 'blocked' WHERE id = 'agent-existing'");

    const agent = await db.get("SELECT status FROM agents WHERE id = 'agent-existing'");
    assert.equal(agent.status, 'blocked', 'the migration must preserve agents and accept guarded status');
  } finally {
    await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().then(() => console.log('Agent status migration checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
