"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { closeDatabase, getDatabase } = require("../src/db");
const ontologyService = require('../src/services/ontologyService');
const propertyService = require('../src/services/propertyService');

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

    await test('defineBeing creates an agent being', async () => {
      const being = await ontologyService.defineBeing('agent-1', { type: 'orchestrator', essence: { role: 'planner', purpose: 'orchestrate' } });
      assert.strictEqual(being.id, 'agent-1');
      assert.strictEqual(being.substanceType, 'orchestrator');
      assert.strictEqual(being.essence.role, 'planner');
    });
    await test('setAttribute sets attributes', async () => {
      await ontologyService.setAttribute({ agentId: 'agent-1', key: 'status', value: 'running', modality: 'accidental' });
      const attrs = await ontologyService.getAttributes('agent-1');
      assert.strictEqual(attrs.status.value, 'running');
      assert.strictEqual(attrs.status.modality, 'accidental');
    });
    await test('supervenience mapping persists an observation without claiming proof', async () => {
      await propertyService.ensurePropertyTables(db);
      await ontologyService.setAttribute({ agentId: 'agent-1', key: 'physical_state', value: { cpu: 'x86', ram: 8 }, modality: 'accidental' });
      const result = await propertyService.registerProperty('agent-1', 'decision_policy', {
        propertyType: 'supervenient', value: { strategy: 'tree-search' }, supervenienceBase: 'physical'
      });
      assert.equal(result.propertyKey, 'decision_policy');
      assert.equal(result.metaphysicalClaimEstablished, false);
      assert.equal(result.supervenienceObservation.observation.comparable, true);
    });
    await test('emergence records only a weak candidate from sampled absence', async () => {
      await propertyService.ensurePropertyTables(db);
      await ontologyService.defineBeing('system-emergence', { type: 'runtime' });
      await ontologyService.defineBeing('part-emergence-a', { type: 'tool' });
      await ontologyService.defineBeing('part-emergence-b', { type: 'tool' });
      await ontologyService.setAttribute({ agentId: 'system-emergence', key: 'coordination', value: 'distributed', modality: 'accidental' });
      const result = await propertyService.detectEmergence('system-emergence', 'coordination', ['part-emergence-a', 'part-emergence-b']);
      assert.equal(result.status, 'candidate');
      assert.equal(result.candidateType, 'weak');
      assert.equal(result.metaphysicalClaimEstablished, false);
    });
    await test('defineMode sets execution modes', async () => {
      const sharedDb = await getDatabase();
      await sharedDb.exec(`DROP TABLE IF EXISTS ontology_modes`);
      await sharedDb.exec(`CREATE TABLE ontology_modes (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, mode TEXT NOT NULL, mode_constraint TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'inactive', activation_condition_json TEXT, activated_at DATETIME, deactivated_at DATETIME, failure_reason TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
      await ontologyService.defineMode('agent-1', 'localRuntime', { constraint: 'possible' });
      const mode = await ontologyService.getMode('agent-1', 'localRuntime');
      assert.strictEqual(mode.constraint, 'possible');
    });
    await test('hypostatize creates autonomous entity from attribute', async () => {
      await ontologyService.setAttribute({ agentId: 'agent-1', key: 'specialty', value: { role: 'code review', purpose: 'review PRs' }, modality: 'essential' });
      const hyp = await ontologyService.hypostatize('agent-1', 'specialty');
      assert.strictEqual(hyp.type, 'hypostasis');
      assert.strictEqual(hyp.attributeKey, 'specialty');
      const essenceObj = typeof hyp.essence === 'string' ? JSON.parse(hyp.essence) : hyp.essence;
      assert.strictEqual(essenceObj.role, 'code review');
      assert.strictEqual(essenceObj.purpose, 'review PRs');
    });
    await test('defineBeing throws on invalid agentId', async () => {
      await assert.rejects(() => ontologyService.defineBeing(''), /valid agentId/);
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
