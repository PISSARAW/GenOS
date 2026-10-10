'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { ensureTables, findExperts } = require('../src/services/communication/transactiveMemoryService');
const { selectAudience } = require('../src/services/communication/audienceSelectorService');

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, role TEXT, model_tier TEXT);
    CREATE TABLE agent_relations (source_agent_id TEXT, target_agent_id TEXT, epistemic_independence REAL);`);
  await ensureTables(db);
  for (let index = 0; index < 200; index += 1) {
    const agentId = `expert-${index}`;
    await db.run('INSERT INTO agents (id, role) VALUES (?, ?)', agentId, 'worker');
    await db.run('INSERT INTO agent_expertise (agent_id, domain, competence) VALUES (?, ?, ?)',
      agentId, 'math', 0.9);
  }
  await db.run('INSERT INTO agents (id, role) VALUES (?, ?)', 'requested', 'worker');
  await db.run('INSERT INTO agent_expertise (agent_id, domain, competence) VALUES (?, ?, ?)',
    'requested', 'math', 0.1);
  return db;
}

async function main() {
  const db = await fixture();
  try {
    const general = await findExperts({ db, domain: 'math', count: 8 });
    assert.equal(general.some((agent) => agent.agentId === 'requested'), false);
    const targeted = await selectAudience({ db, domain: 'math', senderId: 'sender',
      requestedAgentIds: ['requested'], semanticRefs: ['proof:one'] });
    assert.deepEqual(targeted.recipientIds, ['requested']);
    const action = await selectAudience({ db, domain: 'math', senderId: 'sender',
      requestedAgentIds: ['requested'], semanticRefs: [], requiresAction: true });
    assert.deepEqual(action.recipientIds, ['requested']);
    const unneeded = await selectAudience({ db, domain: 'math', senderId: 'sender',
      requestedAgentIds: ['requested'], semanticRefs: [] });
    assert.deepEqual(unneeded.recipientIds, []);
    console.log('Requested audience is ranked before the expert limit.');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
