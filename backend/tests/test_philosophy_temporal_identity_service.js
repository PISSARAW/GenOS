"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { closeDatabase, getDatabase } = require("../src/db");
const temporalIdentityService = require('../src/services/temporalIdentityService');

let passed = 0, failed = 0;
let testChain = Promise.resolve();
async function test(name, fn) {
  const run = testChain.then(async () => {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (err) { failed++; console.log(`  ✗ ${name}: ${err.message}`); }
  });
  testChain = run;
  return run;
}
async function main() {
  const dbPath = path.join(__dirname, `philosophy-test-${Date.now()}.db`);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || "philosophy-test-password";
  process.env.GENOS_ADMIN_TOKEN = process.env.GENOS_ADMIN_TOKEN || "philosophy-test-token";
  try {
    const db = await getDatabase(dbPath);
    await db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_meaning TEXT, role TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('idle','running','completed','blocked','error','terminated','apoptosis','Active','Apoptosis')), agent_type TEXT NOT NULL DEFAULT 'GenOS', execution_mode TEXT NOT NULL DEFAULT 'orchestrator' CHECK (execution_mode IN ('orchestrator','worker')), workspace_id TEXT, fleet_id TEXT, hallucination_monitoring INTEGER NOT NULL DEFAULT 0, hallucination_count INTEGER NOT NULL DEFAULT 0, dissonance_level REAL DEFAULT 0.0, eureka_count INTEGER DEFAULT 0, cognitive_budget REAL DEFAULT 100.0, cognitive_baseline_budget REAL DEFAULT 100.0, cognitive_max_dissonance REAL DEFAULT 50.0, conscience_revision INTEGER NOT NULL DEFAULT 0, is_apoptotic INTEGER DEFAULT 0, model_tier TEXT DEFAULT 'Flash', language TEXT DEFAULT 'TypeScript', isolation_mode TEXT DEFAULT 'Branch', parent_agent_id TEXT, lineage_relation TEXT DEFAULT 'independent', about TEXT, current_task TEXT, runtime_pid INTEGER, runtime_started_at DATETIME, runtime_executable TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, ontology_id TEXT);
      CREATE TABLE IF NOT EXISTS telemetry_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT, session_id TEXT, agent_id TEXT, event_type TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, payload_json TEXT DEFAULT '{}', severity TEXT DEFAULT 'info' CHECK (severity IN ('debug','info','warning','error','critical')), organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS agent_memories (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, problem TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_beings (id TEXT PRIMARY KEY, substance_type TEXT NOT NULL, essence_json TEXT NOT NULL DEFAULT '{}', identity_criteria_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, ceased_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_attributes (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, value_type TEXT NOT NULL, modality TEXT NOT NULL, provenance TEXT NOT NULL DEFAULT 'ontological', previous_value_json TEXT, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP, valid_from DATETIME DEFAULT CURRENT_TIMESTAMP, valid_until DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_modes (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, mode TEXT NOT NULL, mode_constraint TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'inactive', activation_condition_json TEXT, activated_at DATETIME, deactivated_at DATETIME, failure_reason TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_hypostatizations (id INTEGER PRIMARY KEY AUTOINCREMENT, source_being_id TEXT NOT NULL, attribute_key TEXT NOT NULL, target_being_id TEXT NOT NULL, essence_extracted_json TEXT NOT NULL, hypostatization_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME, reabsorbed_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_mereology (id INTEGER PRIMARY KEY AUTOINCREMENT, whole_id TEXT NOT NULL, part_id TEXT NOT NULL, relation_type TEXT NOT NULL, is_essential_part INTEGER DEFAULT 0, proportion REAL, attached_at DATETIME DEFAULT CURRENT_TIMESTAMP, detached_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_identity_events (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, event_type TEXT NOT NULL, description TEXT, previous_essence_hash TEXT, new_essence_hash TEXT, continuity_preserved INTEGER DEFAULT 1, identity_score REAL DEFAULT 1.0, metadata_json TEXT DEFAULT '{}', occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_attribute_history (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, key TEXT NOT NULL, old_value_json TEXT, new_value_json TEXT NOT NULL, modality TEXT NOT NULL, changed_by TEXT, change_reason TEXT, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);

    test('aSeriesPosition computes past/present/future from events', () => {
      const events = [
        { id: 'e1', created_at: '2024-01-01T00:00:00Z' },
        { id: 'e2', created_at: '2024-01-02T00:00:00Z' },
        { id: 'e3', created_at: '2024-01-03T00:00:00Z' },
      ];
      const pos = temporalIdentityService.aSeriesPosition(events);
      assert.strictEqual(pos.past.length, 2);
      assert.strictEqual(pos.present.id, 'e3');
      assert.strictEqual(pos.present.tense, 'present');
      assert.strictEqual(pos.present.isPresent, true);
      assert.deepStrictEqual(pos.future, []);
    });
    test('aSeriesPosition handles empty events', () => {
      const pos = temporalIdentityService.aSeriesPosition([]);
      assert.deepStrictEqual(pos.past, []);
      assert.strictEqual(pos.present, null);
      assert.deepStrictEqual(pos.future, []);
    });
    test('blockUniverse returns eternalism config', () => {
      const result = temporalIdentityService.blockUniverse({ events: [], ontology: 'eternalism' });
      assert.strictEqual(result.ontology, 'eternalism');
      assert.strictEqual(result.allTimesEquallyReal, true);
      assert.strictEqual(result.presentIsFundamental, false);
    });
    test('blockUniverse returns presentism config', () => {
      const result = temporalIdentityService.blockUniverse({ ontology: 'presentism' });
      assert.strictEqual(result.presentIsFundamental, true);
      assert.strictEqual(result.allTimesEquallyReal, false);
    });
    test('blockUniverse throws on invalid ontology', () => {
      assert.throws(() => temporalIdentityService.blockUniverse({ ontology: 'invalid' }), /invalid ontology/);
    });
    test('arrowOfTime returns asymmetric description', () => {
      const result = temporalIdentityService.arrowOfTime({ events: [] });
      assert.strictEqual(result.asymmetric, true);
      assert.strictEqual(result.direction, 'increasing_entropy');
    });
    test('spacetimeRelativity denies absolute time', () => {
      const result = temporalIdentityService.spacetimeRelativity({ events: [] });
      assert.strictEqual(result.absoluteTime, false);
      assert.strictEqual(result.invariant, 'causal_structure');
    });
    await test('aseriesForAgent returns A-series with past/present/future', async () => {
      await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, updated_at) VALUES ('agent-t1', 'Agent T1', 'worker', 'running', '2024-01-03T00:00:00Z')`);
      await db.run(`INSERT INTO telemetry_events (agent_id, event_type, action, created_at) VALUES ('agent-t1', 'action', 'run', '2024-01-01T00:00:00Z')`);
      await db.run(`INSERT INTO telemetry_events (agent_id, event_type, action, created_at) VALUES ('agent-t1', 'action', 'run', '2024-01-02T00:00:00Z')`);
      const result = await temporalIdentityService.aseriesForAgent({ db, agentId: 'agent-t1' });
      assert.strictEqual(result.agentId, 'agent-t1');
      assert.ok(result.aSeries);
      assert.strictEqual(result.aSeries.tensed, true);
      assert.strictEqual(result.aSeries.past.length, 2);
      assert.ok(result.aSeries.mctaggartClaim);
    });
    await test('bseriesForAgent returns B-series timeline', async () => {
      await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, updated_at) VALUES ('agent-t2', 'Agent T2', 'worker', 'running', '2024-01-03T00:00:00Z')`);
      await db.run(`INSERT INTO telemetry_events (agent_id, event_type, action, created_at) VALUES ('agent-t2', 'action', 'run', '2024-01-01T00:00:00Z')`);
      await db.run(`INSERT INTO telemetry_events (agent_id, event_type, action, created_at) VALUES ('agent-t2', 'action', 'run', '2024-01-02T00:00:00Z')`);
      const result = await temporalIdentityService.bseriesForAgent({ db, agentId: 'agent-t2' });
      assert.strictEqual(result.agentId, 'agent-t2');
      assert.strictEqual(result.bSeries.tenseless, true);
      assert.strictEqual(result.bSeries.timeline.length, 2);
      assert.ok(result.bSeries.mctaggartClaim);
    });
    await test('checkMemoryContinuity detects gaps', async () => {
      await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status) VALUES ('agent-t3', 'Agent T3', 'worker', 'running')`);
      await db.run(`INSERT INTO agent_memories (id, agent_id, created_at, content) VALUES ('m-t1', 'agent-t3', '2024-01-01T00:00:00Z', 'mem1')`);
      await db.run(`INSERT INTO agent_memories (id, agent_id, created_at, content) VALUES ('m-t2', 'agent-t3', '2024-01-03T00:00:00Z', 'mem2')`);
      const result = await temporalIdentityService.checkMemoryContinuity({ db, agentId: 'agent-t3' });
      assert.strictEqual(result.agentId, 'agent-t3');
      assert.strictEqual(result.continuous, false);
      assert.ok(result.gaps.length > 0);
      assert.ok(result.gaps[0].lockeanProblem);
    });
    await test('checkMemoryContinuity preserves identity with no gaps', async () => {
      await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status) VALUES ('agent-t4', 'Agent T4', 'worker', 'running')`);
      await db.run(`INSERT INTO agent_memories (id, agent_id, created_at, content) VALUES ('m-t3', 'agent-t4', '2024-01-01T00:00:00Z', 'mem1')`);
      await db.run(`INSERT INTO agent_memories (id, agent_id, created_at, content) VALUES ('m-t4', 'agent-t4', '2024-01-01T12:00:00Z', 'mem2')`);
      const result = await temporalIdentityService.checkMemoryContinuity({ db, agentId: 'agent-t4' });
      assert.strictEqual(result.continuous, true);
      assert.strictEqual(result.gaps.length, 0);
      assert.ok(result.lockeQuote);
    });
    await test('shipOfTheseus detects identity preservation below threshold', async () => {
      await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, about) VALUES ('agent-t5', 'Agent T5', 'worker', 'running', 'happiness goodness awareness')`);
      await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, about) VALUES ('agent-t6', 'Agent T6', 'worker', 'running', 'consciousnessness')`);
      const result = await temporalIdentityService.shipOfTheseus({ db, agentId: 'agent-t5', replacedComponents: ['comp1'] });
      assert.strictEqual(result.agentId, 'agent-t5');
      assert.strictEqual(result.identityPreserved, true);
      assert.strictEqual(result.totalComponents, 3);
    });
    await test('shipOfTheseus detects identity crisis above threshold', async () => {
      const result = await temporalIdentityService.shipOfTheseus({ db, agentId: 'agent-t6', replacedComponents: ['comp1', 'comp2', 'comp3'] });
      assert.strictEqual(result.identityPreserved, false);
      assert.ok(result.theeseProblem);
    });
    await test('aseriesForAgent throws on missing agentId', async () => {
      await assert.rejects(() => temporalIdentityService.aseriesForAgent({ db, agentId: '' }), /requires agentId/);
    });
    await test('bseriesForAgent throws on empty agentId', async () => {
      await assert.rejects(() => temporalIdentityService.bseriesForAgent({ db, agentId: '' }), /requires agentId/);
    });
    await test('checkMemoryContinuity throws on missing agentId', async () => {
      await assert.rejects(() => temporalIdentityService.checkMemoryContinuity({ db, agentId: '' }), /requires agentId/);
    });
    await test('shipOfTheseus throws on empty agentId', async () => {
      await assert.rejects(() => temporalIdentityService.shipOfTheseus({ db, agentId: '' }), /requires agentId/);
    });
    
    await testChain;
    console.log(`\n${passed} passed, ${failed} failed\n`);
  } finally {
    await closeDatabase();
    ["", "-shm", "-wal"].forEach(s => { try { fs.unlinkSync(`${dbPath}${s}`); } catch (_) {} });
  }
  if (failed > 0) process.exit(1);
}
main().catch(err => process.exit(1));
