const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const manifestService = require('../src/services/communication/communicationManifestService');
const { buildManifest } = manifestService;

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, metadata_json TEXT);
      CREATE TABLE signal_subscriptions (subscriber_agent_id TEXT, topic TEXT);
      CREATE TABLE agent_relations (source_agent_id TEXT, target_agent_id TEXT,
        relation_type TEXT, weight REAL);`);
    await db.run('INSERT INTO agents (id, metadata_json) VALUES (?, ?)',
      ['agent-1', JSON.stringify({ phenotypeId: 'Specialist' })]);
    await db.run('INSERT INTO agents (id, metadata_json) VALUES (?, ?)',
      ['agent-3', JSON.stringify({ phenotypeId: 'Reconciler' })]);
    await db.run('INSERT INTO signal_subscriptions VALUES (?, ?)', ['agent-1', 'alerts']);
    const manifest = await buildManifest({ db, agentId: 'agent-1', phenotype: { id: 'Specialist' } });
    assert.equal(manifest.phenotypeId, 'Specialist');
    assert.ok(manifest.allowedChannels.includes('DIALOGUE'));
    assert.deepEqual(manifest.subscriptions, ['alerts']);
    const fromDatabase = await buildManifest({ db, agentId: 'agent-3' });
    assert.deepEqual(fromDatabase.allowedChannels, ['UNICAST'], 'database phenotype constrains channels when runtime context omits it');
    const bounded = await buildManifest({ db, agentId: 'agent-2', phenotype: { id: 'BoundedWorker' } });
    const denied = manifestService.enforceManifestChannel(bounded, {
      action: 'DIALOGUE', scope: 'SELF', recipients: [], reasonCodes: [], meta: {}
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.decision.action, 'SILENCE');
    assert.equal(manifestService.decisionChannel({ action: 'SIGNAL', scope: 'QUORUM' }), 'SIGNAL');
    const first = await manifestService.reserveBudget({ db, agentId: 'agent-2', total: 10, amount: 7 });
    const second = await manifestService.reserveBudget({ db, agentId: 'agent-2', total: 10, amount: 4 });
    assert.equal(first.reserved, true);
    assert.equal(second.reserved, false);
    const rebuilt = await buildManifest({ db, agentId: 'agent-2', phenotype: { id: 'BoundedWorker' } });
    assert.equal(rebuilt.communicationBudget.used, 7, 'budget use persists across manifest rebuilds');
    console.log('Communication manifest reads the V3 agent schema.');
  } finally {
    await db.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
