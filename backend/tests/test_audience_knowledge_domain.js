'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const expertise = require('../src/services/communication/transactiveMemoryService');
const ground = require('../src/services/communication/commonGroundService');
const { selectAudience } = require('../src/services/communication/audienceSelectorService');

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, role TEXT, model_tier TEXT);
    CREATE TABLE agent_relations (source_agent_id TEXT, target_agent_id TEXT, epistemic_independence REAL);
    INSERT INTO agents (id, role) VALUES ('receiver', 'worker');`);
  await expertise.ensureTables(db);
  for (const domain of ['general', 'math', 'physics']) {
    await db.run('INSERT INTO agent_expertise (agent_id, domain, competence) VALUES (?, ?, ?)',
      'receiver', domain, 0.9);
  }
  return db;
}

function select(db, options) {
  return selectAudience({ db, senderId: 'sender', requestedAgentIds: ['receiver'],
    domain: 'math', ...options });
}

function remember(db, options) {
  return ground.recordGrounding({ db, agentA: 'sender', agentB: 'receiver',
    domain: 'math', status: 'grounded', confidence: 1, ...options });
}

async function domainIsolation(db) {
  const semanticRefs = ['proof:math-known'];
  await remember(db, { semanticFingerprint: semanticRefs[0] });
  const matching = await select(db, { semanticRefs });
  assert.deepEqual(matching.recipientIds, [], 'matching grounded knowledge should remove an informational recipient');
  const otherDomain = await select(db, { semanticRefs, domain: 'physics' });
  assert.deepEqual(otherDomain.recipientIds, ['receiver'], 'knowledge in math must not suppress physics delivery');
  assert.deepEqual(otherDomain.candidates[0].unknownRefs, semanticRefs);

  const generalRef = 'proof:general-only';
  await remember(db, { domain: 'general', semanticFingerprint: generalRef });
  const general = await select(db, { domain: 'general', semanticRefs: [generalRef] });
  assert.deepEqual(general.recipientIds, []);
  const math = await select(db, { semanticRefs: [generalRef] });
  assert.deepEqual(math.recipientIds, ['receiver'], 'general knowledge must not leak into an explicit domain');
}

async function pairIsolation(db) {
  const semanticRefs = ['proof:other-recipient'];
  await remember(db, { agentB: 'other', semanticFingerprint: semanticRefs[0] });
  const audience = await select(db, { semanticRefs });
  assert.deepEqual(audience.recipientIds, ['receiver'], 'another recipient\'s ground is not shared ground');
}

async function invalidatedKnowledge(db) {
  for (const status of ['stale', 'revoked', 'contradicted']) {
    const semanticFingerprint = `proof:${status}`;
    await remember(db, { semanticFingerprint });
    await ground.invalidateGround({ db, agentA: 'sender', agentB: 'receiver',
      domain: 'math', semanticFingerprint, status });
    const audience = await select(db, { semanticRefs: [semanticFingerprint] });
    assert.deepEqual(audience.recipientIds, ['receiver'], `${status} knowledge must be delivered again`);
    assert.deepEqual(audience.candidates[0].unknownRefs, [semanticFingerprint]);
  }
}

async function expiredKnowledge(db) {
  const semanticRefs = ['proof:expired'];
  await remember(db, { semanticFingerprint: semanticRefs[0] });
  await db.run(`UPDATE communication_common_ground SET expires_at = datetime('now', '-1 day')
    WHERE domain = ? AND semantic_fingerprint = ?`, 'math', semanticRefs[0]);
  const audience = await select(db, { semanticRefs });
  assert.deepEqual(audience.recipientIds, ['receiver'], 'expired knowledge must not suppress delivery');
  assert.deepEqual(audience.candidates[0].unknownRefs, semanticRefs);
}

async function actionAndDelta(db) {
  const known = 'proof:math-known';
  const action = await select(db, { semanticRefs: [known], requiresAction: true });
  assert.deepEqual(action.recipientIds, ['receiver'], 'knowledge does not satisfy an action obligation');
  assert.deepEqual(action.candidates[0].unknownRefs, []);
  const delta = await select(db, { semanticRefs: [known, 'proof:new'] });
  assert.deepEqual(delta.recipientIds, ['receiver']);
  assert.deepEqual(delta.candidates[0].unknownRefs, ['proof:new']);
  assert.deepEqual(delta.groups[0].unknownRefs, ['proof:new']);
}

async function main() {
  const db = await fixture();
  try {
    await domainIsolation(db);
    await pairIsolation(db);
    await invalidatedKnowledge(db);
    await expiredKnowledge(db);
    await actionAndDelta(db);
    console.log('[PASS] Audience knowledge is domain- and pair-scoped, fresh, and preserves action obligations.');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
