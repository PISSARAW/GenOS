'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const dbModule = require('../src/db');
const modelRouter = require('../src/services/modelRouter');
const biocenose = require('../src/services/biocenoseService');
const store = require('../src/services/biocenose/communityStore');

async function testSelectedFormation(db) {
  const security = await biocenose.prepareCommunity({ db, orchestratorId: 'operator',
    mission: 'Audit security threats and falsify this design.' });
  assert.equal(security.variant, 'adversarial_assembly');
  assert.equal(security.variantSelection.method, 'mission_signals');
  assert.ok(security.members.some((member) => member.role === 'adversarial_reviewer'));

  const count = await db.get('SELECT COUNT(*) AS value FROM biocenose_communities');
  await assert.rejects(() => biocenose.prepareCommunity({ db, orchestratorId: 'operator',
    mission: 'Build a representative panel for this community.' }),
  (error) => error.code === 'BIOCENOSE_REPRESENTATIVE_POPULATION_REQUIRED');
  assert.equal((await db.get('SELECT COUNT(*) AS value FROM biocenose_communities')).value, count.value);

  const candidates = Array.from({ length: 9 }, (_, index) => ({ memberId: `member-${index}`,
    provider: `provider-${index}`, expertise: ['general'], communityRole: 'generator' }));
  const representative = await biocenose.prepareCommunity({ db, orchestratorId: 'operator',
    mission: 'Build a representative panel for this community.',
    options: { memberCandidates: candidates } });
  assert.equal(representative.variant, 'representative_community');
  assert.ok(representative.formation.representative.sampleSize > 0);

  const before = await db.get('SELECT COUNT(*) AS value FROM biocenose_communities');
  await assert.rejects(() => biocenose.prepareCommunity({ db, orchestratorId: 'operator',
    mission: 'What is the API contract?', options: { variant: 'forecasting_crowd' } }),
  (error) => error.code === 'BIOCENOSE_VARIANT_QUESTION_TYPE_INVALID');
  assert.equal((await db.get('SELECT COUNT(*) AS value FROM biocenose_communities')).value, before.value);
}

async function testExplicitPublicCycle(db) {
  const originalGet = dbModule.getDatabase;
  const originalGenerate = modelRouter.generate;
  dbModule.getDatabase = async () => db;
  modelRouter.generate = async () => { throw new Error('MODEL_UNAVAILABLE'); };
  try {
    const tools = require('../src/services/topologyMcpTools');
    const request = { mode: 'biocenose', orchestrator_id: 'operator',
      mission: 'Assess the supplied proposition.', variant_id: 'epistemic_jury' };
    const composed = await tools.composeBiologicalMode(request);
    assert.equal(composed.status, 'topology_composed');
    assert.equal(composed.variant, 'epistemic_jury');
    const executed = await tools.composeBiologicalMode({ ...request, execute_round: true });
    assert.equal(executed.success, false);
    assert.equal(executed.status, 'tool_error');
    assert.ok(executed.communityId);
    assert.equal(executed.variant, 'epistemic_jury');
    const events = await store.listEvents(db, executed.communityId);
    assert.ok(events.some((event) => event.type === 'DELIBERATION_STEP_BLOCKED'));
    assert.equal((await store.loadSession(db, executed.communityId)).status, 'ACTIVE');
    assert.equal((await db.get('SELECT COUNT(*) AS value FROM biocenose_judgments WHERE community_id = ?',
      executed.communityId)).value, 0);
    modelRouter.generate = async (options) => ({ text: modelAnswer(options.responseFormat?.name),
      provider: 'fixture', model: 'fixture' });
    const unverified = await tools.composeBiologicalMode({ ...request, execute_round: true });
    assert.equal(unverified.success, true);
    assert.equal(unverified.status, 'topology_cycle_recorded');
    assert.equal(unverified.receipts.length, 9);
    assert.ok(unverified.receipts.every((receipt) => /^[a-f0-9]{64}$/.test(receipt.resultHash)));
    assert.notEqual(unverified.judgment?.status, 'DECIDED');
    assert.notEqual(unverified.judgment?.promotionGate?.status, 'ALLOWED');
    const rejected = await tools.composeBiologicalMode({ ...request, mode: 'biome', execute_round: true });
    assert.equal(rejected.code, 'BIOCENOSE_EXECUTION_MODE_INVALID');
  } finally {
    dbModule.getDatabase = originalGet;
    modelRouter.generate = originalGenerate;
  }
}

function modelAnswer(name) {
  if (name === 'biocenose_sealed_judgment') return JSON.stringify({ judgment: {
    position: 'unverified', confidence: 0.5,
    claims: [{ statement: 'The proposition is true.', type: 'FACTUAL' }],
    assumptions: [], evidenceRefs: [], unknowns: [], abstentions: [], probabilities: []
  } });
  if (name === 'biocenose_review') return JSON.stringify({ summary: 'No independent verification.',
    arguments: [] });
  if (name === 'biocenose_revision') return JSON.stringify({ previousPosition: 'unverified',
    newPosition: 'unverified', changedClaims: [], reasonCodes: [], evidenceRefs: [] });
  throw new Error(`Unexpected model phase ${name}`);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await testSelectedFormation(db);
    await testExplicitPublicCycle(db);
  } finally { await db.close(); }
}

run().then(() => console.log('Biocenose public cycle: PASS')).catch((error) => {
  console.error(error); process.exitCode = 1;
});
