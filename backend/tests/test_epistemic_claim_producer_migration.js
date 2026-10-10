'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateEpistemicEvents } = require('../src/db/migrations/migrateEpistemicEvents');
const revision = require('../src/services/epistemic/revisionSurface');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE epistemic_claims (
      id TEXT PRIMARY KEY, subject TEXT, claim_json TEXT NOT NULL,
      quality REAL NOT NULL DEFAULT 0, status TEXT DEFAULT 'active',
      revision INTEGER DEFAULT 0, updated_at DATETIME
    )`);
    await migrateEpistemicEvents(db);
    const columns = await db.all('PRAGMA table_info(epistemic_claims)');
    assert(columns.some((column) => column.name === 'producer_agent_id'));
    revision.configureRevisionStore(db);
    await revision.persistClaim({ id: 'claim-A', subject: 'body', origin: 'SelfGenerated' }, { agentId: 'agent-A' });
    await revision.persistClaim({ id: 'claim-B', subject: 'body', origin: 'ExternalObserved' }, { agentId: 'agent-B' });
    const owned = await db.all("SELECT id FROM epistemic_claims WHERE producer_agent_id = ? AND status = 'active'", 'agent-A');
    assert.deepEqual(owned.map((row) => row.id), ['claim-A']);
    console.log('Epistemic claims migration and producer scope passed.');
  } finally {
    revision.configureRevisionStore(null);
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
