'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

process.env.NODE_ENV = 'test';
process.env.GENOS_SCHEMA_MAINTENANCE = '0';

const { initializeSchema } = require('../src/db/schema');
const learning = require('../src/services/communication/communicationLearningService');
const signalMetrics = require('../src/services/signalMetricsService');
const plasticity = require('../src/services/synapticPlasticityService');

const DB_PATH = path.join(os.tmpdir(), `genos-comm-learn-${process.pid}-${Date.now()}.db`);

async function setup() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA busy_timeout = 5000;');
  await initializeSchema(db);
  return db;
}

async function seedAgents(db) {
  await db.run(
    `INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier, created_at)
     VALUES ('alice', 'Alice', 'orchestrator', 'idle', 100, 'Pro', CURRENT_TIMESTAMP)`
  );
  await db.run(
    `INSERT INTO agents (id, name, role, status, cognitive_budget, model_tier, created_at)
     VALUES ('bob', 'Bob', 'worker', 'idle', 100, 'Flash', CURRENT_TIMESTAMP)`
  );
}

async function seedRelation(db) {
  await db.run(
    `INSERT INTO agent_relations
      (id, source_agent_id, target_agent_id, relation_type, familiarity, interaction_count,
       authority, common_ground_estimate, epistemic_independence, error_correlation,
       disclosure_level, last_interaction, updated_at)
     VALUES ('rel-alice-bob', 'alice', 'bob', 'peer', 0.5, 10, 0.3, 0.4, 0.7, 0.1, 0.5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
}

async function seedExpertise(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS agent_expertise (
    agent_id TEXT NOT NULL, domain TEXT NOT NULL,
    competence REAL NOT NULL DEFAULT 0, calibration REAL NOT NULL DEFAULT 0,
    reliability REAL NOT NULL DEFAULT 0, evidence_count INTEGER NOT NULL DEFAULT 0,
    freshness REAL NOT NULL DEFAULT 0, last_success DATETIME,
    capabilities_json TEXT NOT NULL DEFAULT '[]', tools_json TEXT NOT NULL DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (agent_id, domain)
  )`);
  await db.run(
    `INSERT INTO agent_expertise (agent_id, domain, competence, calibration, reliability, evidence_count, updated_at)
     VALUES ('bob', 'planning', 0.6, 0.25, 0.7, 5, CURRENT_TIMESTAMP)`
  );
}

async function seedCommonGround(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS communication_common_ground (
    agent_a TEXT NOT NULL, agent_b TEXT NOT NULL, domain TEXT NOT NULL,
    semantic_fingerprint TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed',
    confidence REAL NOT NULL DEFAULT 0, grounded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME,
    provenance_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (agent_a, agent_b, domain, semantic_fingerprint),
    CHECK (agent_a < agent_b),
    CHECK (status IN ('proposed', 'grounded', 'stale', 'revoked', 'contradicted')),
    CHECK (json_valid(provenance_json))
  )`);
  await db.run(
    `INSERT INTO communication_common_ground
      (agent_a, agent_b, domain, semantic_fingerprint, status, confidence, provenance_json)
     VALUES ('alice', 'bob', 'planning', 'sha256:existing_fp', 'grounded', 0.5, '{}')`
  );
}

async function seedDialects(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS dialects (
    dialect_id TEXT PRIMARY KEY, participants_key TEXT NOT NULL,
    participant_a TEXT NOT NULL, participant_b TEXT NOT NULL,
    domain TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    base_vocabulary TEXT NOT NULL DEFAULT 'genos-canonical-v3',
    common_ground_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    CHECK (participant_a < participant_b),
    CHECK (status IN ('active', 'retired'))
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS dialect_symbols (
    dialect_id TEXT NOT NULL, symbol TEXT NOT NULL,
    semantic_fingerprint TEXT NOT NULL, canonical_meaning TEXT NOT NULL,
    payload_schema_json TEXT NOT NULL DEFAULT '{}',
    use_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0.5,
    PRIMARY KEY (dialect_id, symbol)
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS dialect_candidates (
    id TEXT PRIMARY KEY, participants_key TEXT NOT NULL, domain TEXT NOT NULL,
    phrase_hash TEXT NOT NULL, phrase_sample TEXT NOT NULL,
    last_fingerprint TEXT NOT NULL, frequency INTEGER NOT NULL DEFAULT 1,
    variance_count INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'proposed',
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('proposed', 'accepted', 'rejected'))
  )`);
  await db.run(
    "INSERT INTO dialects (dialect_id, participants_key, participant_a, participant_b, domain, common_ground_hash) VALUES ('dialect-alice-bob-planning', 'alice|bob', 'alice', 'bob', 'planning', 'hash-abc')"
  );
  await db.run(
    `INSERT INTO dialect_symbols (dialect_id, symbol, semantic_fingerprint, canonical_meaning, use_count, success_count, confidence)
     VALUES ('dialect-alice-bob-planning', 'phi-1', 'sha256:phi_fp', 'phi-meaning', 3, 2, 0.67)`
  );
}

async function seedSubscriptions(db) {
  await db.run(
    `INSERT INTO signal_subscriptions (subscriber_agent_id, topic, created_at)
     VALUES ('bob', 'signal/planning', CURRENT_TIMESTAMP)`
  );
}

async function seedSynapses(db) {
  await db.run(
    `INSERT INTO genome_decisions (id, title, content, created_by, category, created_at)
     VALUES ('gd-src', 'Src', 'src', 'alice', 'strategy', CURRENT_TIMESTAMP)`
  );
  await db.run(
    `INSERT INTO genome_decisions (id, title, content, created_by, category, created_at)
     VALUES ('gd-tgt', 'Tgt', 'tgt', 'alice', 'strategy', CURRENT_TIMESTAMP)`
  );
  await db.run(
    `INSERT INTO memory_synapses (source_id, target_id, weight, last_updated_at)
     VALUES ('gd-src', 'gd-tgt', 0.7, CURRENT_TIMESTAMP)`
  );
}

async function testLearnSuccess(db) {
  signalMetrics.resetMetrics();
  plasticity.resetWeights();

  const input = {
    db,
    senderId: 'alice',
    receiverId: 'bob',
    domain: 'planning',
    semanticRefs: ['sha256:new_ref_1'],
    channel: 'structured',
    actionTaken: true,
    interpretationCorrect: true,
    recipientKnew: false,
    tokensUsed: 120,
    dialectId: 'dialect-alice-bob-planning',
    dialectSymbol: 'phi-1',
    dialectSuccess: true,
    phraseSample: 'analysis complete',
  };

  const result = await learning.learnFromOutcome(input);

  assert.ok(result.journalId, 'journalId present');
  assert.ok(result.journalId > 0, 'journalId is positive');
  assert.equal(result.outcome, 'action_taken', 'outcome = action_taken');
  assert.equal(result.success, true, 'success = true');
  assert.equal(result.expertise, true, 'expertise recorded');
  assert.strictEqual(result.groundCorrections, 0, 'no ground corrections (recipientKnew=false)');
  assert.ok(result.dialect.usage, 'dialect usage recorded');
  assert.ok(result.dialect.phrase, 'dialect phrase observed');
  assert.ok(result.relation.noted, 'relation noted');
  assert.ok(result.channel === 'acted' || result.channel === 'verbal', 'channel = acted');

  const outcome = await db.get('SELECT * FROM communication_outcomes WHERE id = ?', result.journalId);
  assert.equal(outcome.sender_id, 'alice', 'journal sender persisted');
  assert.equal(outcome.receiver_id, 'bob', 'journal receiver persisted');
  assert.equal(outcome.outcome, 'action_taken', 'journal outcome persisted');
  assert.equal(outcome.action_taken, 1, 'journal action_taken persisted');
  assert.equal(outcome.tokens_used, 120, 'journal tokens_used persisted');

  const expertise = await db.get('SELECT * FROM agent_expertise WHERE agent_id = ? AND domain = ?', 'bob', 'planning');
  assert.ok(expertise, 'expertise row present');
  assert.ok(Number(expertise.evidence_count) >= 6, 'evidence count incremented');
  assert.ok(Number(expertise.competence) >= 0.5, 'competence maintained');

  const symbol = await db.get('SELECT * FROM dialect_symbols WHERE dialect_id = ? AND symbol = ?', 'dialect-alice-bob-planning', 'phi-1');
  assert.ok(symbol, 'dialect symbol recorded');
  assert.ok(Number(symbol.use_count) >= 1, 'symbol use_count >= 1');

  const candidate = await db.get('SELECT * FROM dialect_candidates WHERE domain = ?', 'planning');
  assert.ok(candidate, 'dialect candidate observed');
  assert.equal(candidate.frequency, 1, 'candidate frequency = 1');

  const relation = await db.get('SELECT * FROM agent_relations WHERE source_agent_id = ? AND target_agent_id = ?', 'alice', 'bob');
  assert.ok(relation, 'relation present');
  assert.ok(Number(relation.interaction_count) >= 11, 'interaction_count incremented');

  const ground = await db.get('SELECT * FROM communication_common_ground WHERE semantic_fingerprint = ?', 'sha256:new_ref_1');
  assert.equal(ground, undefined, 'no common ground for new ref (recipientKnew=false)');
}

async function testLearnRecipientKnew(db) {
  signalMetrics.resetMetrics();
  plasticity.resetWeights();

  const input = {
    db,
    senderId: 'alice',
    receiverId: 'bob',
    domain: 'planning',
    semanticRefs: ['sha256:existing_fp'],
    channel: 'MICRO_UTTERANCE',
    actionTaken: false,
    interpretationCorrect: false,
    recipientKnew: true,
    tokensUsed: 80,
  };

  const result = await learning.learnFromOutcome(input);

  assert.ok(result.journalId > 0, 'journalId present');
  assert.equal(result.outcome, 'no_effect', 'outcome = no_effect');
  assert.equal(result.success, false, 'success = false');
  assert.equal(result.expertise, false, 'no expertise (recipientKnew=true)');
  assert.strictEqual(result.groundCorrections, 1, 'ground corrected for 1 ref');
  assert.equal(result.channel, 'verbal', 'channel = verbal (MICRO_UTTERANCE)');

  const ground = await db.get(
    'SELECT * FROM communication_common_ground WHERE agent_a = ? AND agent_b = ? AND semantic_fingerprint = ?',
    'alice', 'bob', 'sha256:existing_fp'
  );
  assert.ok(ground, 'ground entry exists');
  assert.equal(ground.status, 'grounded', 'ground status = grounded');

  const relation = await db.get('SELECT * FROM agent_relations WHERE source_agent_id = ? AND target_agent_id = ?', 'alice', 'bob');
  assert.ok(Number(relation.familiarity) <= 0.5, 'familiarity not boosted on failure');
}

async function testReturnShape(db) {
  const input = {
    db,
    senderId: 'alice',
    receiverId: 'bob',
    domain: 'planning',
    semanticRefs: ['sha256:shape_test'],
    channel: 'structured',
    actionTaken: true,
    tokensUsed: 50,
  };

  const result = await learning.learnFromOutcome(input);

  const required = ['journalId', 'outcome', 'success', 'expertise', 'groundCorrections', 'dialect', 'relation', 'channel'];
  for (const key of required) {
    assert.ok(key in result, `return shape has '${key}'`);
  }

  assert.ok(typeof result.expertise === 'boolean', 'expertise is boolean');
  assert.ok(typeof result.groundCorrections === 'number', 'groundCorrections is number');
  assert.ok(typeof result.dialect === 'object', 'dialect is object');
  assert.ok('usage' in result.dialect && 'phrase' in result.dialect, 'dialect has usage/phrase');
  assert.ok(typeof result.relation === 'object', 'relation is object');
  assert.ok('noted' in result.relation, 'relation has noted');
  assert.ok(['acted', 'verbal', 'wasted'].includes(result.channel), 'channel is valid');
}

async function run() {
  const db = await setup();
  try {
    await seedAgents(db);
    await seedRelation(db);
    await seedExpertise(db);
    await seedCommonGround(db);
    await seedDialects(db);
    await seedSubscriptions(db);
    await seedSynapses(db);

    await testLearnSuccess(db);
    console.log('[PASS] learnFromOutcome success case');

    await testLearnRecipientKnew(db);
    console.log('[PASS] learnFromOutcome recipientKnew case');

    await testReturnShape(db);
    console.log('[PASS] return shape correct');

    console.log('\nAll communication learning tests passed.');
  } finally {
    await db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(DB_PATH + suffix); } catch (_) {}
    }
  }
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  console.error(err.stack);
  process.exit(1);
});
