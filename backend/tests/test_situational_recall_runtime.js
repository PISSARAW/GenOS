'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./helpers/memoryConsumerFixture.cjs');

async function insertMemory(db, input) {
  await db.run(`INSERT INTO genome_decisions
    (id,title,content,category,created_by,organization_id,project_id,evidence_refs_json)
    VALUES (?,'recallprobe',?,?,'fixture',?,?,?)`, input.id, input.content,
  input.category || 'Experience', input.scope.organization_id, input.scope.project_id,
  JSON.stringify(input.evidenceRefs || []));
}

async function seed(db, scope) {
  await insertMemory(db, { id: 'recall-causal', content: 'recallprobe SQLite transaction contention: serialize concurrent writers',
    scope, evidenceRefs: ['historical-log:recall-causal'] });
  await insertMemory(db, { id: 'recall-wrong', content: 'recallprobe timeout network HTTP socket deadline', scope });
  await insertMemory(db, { id: 'recall-foreign-project', content: 'recallprobe SQLite concurrent transaction',
    scope: { ...scope, project_id: 'p1-consumer-sibling' } });
  await insertMemory(db, { id: 'recall-foreign-mission', content: 'recallprobe SQLite concurrent transaction\n[MISSION_SCOPE id=other]', scope });
  await insertMemory(db, { id: 'recall-unverified', content: 'recallprobe SQLite concurrent transaction', scope, category: 'UnverifiedExperience' });
  await insertMemory(db, { id: 'recall-inhibited', content: 'recallprobe SQLite concurrent transaction', scope });
  await db.run(`INSERT INTO memory_synapses (source_id,target_id,weight,transmitter_type,organization_id,project_id)
    VALUES ('recall-causal','recall-inhibited',-1,'gaba',?,?)`, scope.organization_id, scope.project_id);
}

async function checkPrompt(scope) {
  const memory = require('../src/services/agentMemoryContext');
  const query = 'recallprobe diagnose concurrent shared file writes timeout';
  const options = { organizationId: scope.organization_id, projectId: scope.project_id,
    missionScope: { missionId: 'current' }, peekVesicles: true,
    recallPhase: 'diagnosis', referenceTime: '2026-10-23T12:00:00Z' };
  const memories = await memory.retrieveAgentMemories('fixture', query, options);
  const own = memories.experiences.filter((item) => item.id.startsWith('recall-'));
  assert.equal(own[0].id, 'recall-causal');
  assert.deepEqual(own[0].evidenceRefs, ['historical-log:recall-causal']);
  assert.equal(own[0].recall.phase, 'diagnosis');
  const ids = memories.experiences.map((item) => item.id);
  for (const id of ['recall-foreign-project', 'recall-foreign-mission', 'recall-unverified', 'recall-inhibited']) {
    assert.ok(!ids.includes(id), id);
  }
  const prompt = await memory.formatCognitiveMemoryPrompt('fixture', query, options);
  assert.ok(prompt.includes('SQLite transaction contention'));
  assert.ok(prompt.includes('situational-recall-v1'));
  assert.ok(prompt.includes('historical-log:recall-causal'));
  assert.ok(prompt.includes('non preuve indépendante'));
  assert.equal(await memory.formatCognitiveMemoryPrompt('fixture', query,
    { ...options, historicalMemoryTokenBudget: 0 }), '');
  const legacy = await memory.retrieveAgentMemories('fixture', query, { ...options, situationalRecall: false });
  assert.ok(legacy.experiences.every((item) => !item.recall));
}

async function checkMissionOptions(scope) {
  const { attachMissionMemoryContext } = require('../src/services/agentRuntimeAdapter/missionLease');
  const mission = { prompt: 'recallprobe diagnose concurrent file writes',
    organizationId: scope.organization_id, projectId: scope.project_id,
    missionScope: { missionId: 'current' }, recallPhase: 'verification', contextTokenBudget: 5000 };
  const attached = await attachMissionMemoryContext({ ...mission }, 'fixture');
  assert.equal(attached.memoryContextAttached, true);
  assert.ok(attached.prompt.includes('"phase":"verification"'));
  const legacy = await attachMissionMemoryContext({ ...mission, situationalRecall: false }, 'fixture');
  assert.equal(legacy.memoryContextAttached, true);
  assert.ok(!legacy.prompt.includes('situational-recall-v1'));
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-situational-recall-'));
  process.env.GENOS_DISABLE_DOTENV = '1';
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD = 'isolated-situational-recall-test-only';
  process.env.GENOS_EMBEDDING_PROVIDER = 'none';
  process.env.GENOS_DB_PATH = path.join(root, 'memory.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  const store = require('../src/db');
  try {
    const db = await store.getDatabase();
    const scope = await fixture.seed(db);
    await seed(db, scope);
    await checkPrompt(scope);
    await checkMissionOptions(scope);
  } finally {
    await store.closeDatabase();
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('Situational recall runtime: SQLite retrieval, scope, inhibition, provenance, prompt, mission options and zero budget passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
