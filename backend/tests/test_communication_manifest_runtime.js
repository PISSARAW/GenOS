const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const { buildManifest } = require('../src/services/communication/communicationManifestService');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, metadata_json TEXT);
      CREATE TABLE signal_subscriptions (subscriber_agent_id TEXT, topic TEXT);
      CREATE TABLE agent_relations (source_agent_id TEXT, target_agent_id TEXT,
        relation_type TEXT, weight REAL);`);
    await db.run('INSERT INTO agents (id, metadata_json) VALUES (?, ?)',
      ['agent-1', JSON.stringify({ phenotypeId: 'Specialist' })]);
    await db.run('INSERT INTO signal_subscriptions VALUES (?, ?)', ['agent-1', 'alerts']);
    const manifest = await buildManifest({ db, agentId: 'agent-1', phenotype: { id: 'Specialist' } });
    assert.equal(manifest.phenotypeId, 'Specialist');
    assert.ok(manifest.allowedChannels.includes('DIALOGUE'));
    assert.deepEqual(manifest.subscriptions, ['alerts']);
    console.log('Communication manifest reads the V3 agent schema.');
  } finally {
    await db.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
