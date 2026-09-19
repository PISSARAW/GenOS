"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { closeDatabase, getDatabase } = require("../src/db");
const spinozaService = require('../src/services/spinozaService');

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

    test('substanceUnique describes GenOS as Deus sive Natura', () => {
      const s = spinozaService.substanceUnique({ system: { agents: [{ id: 'a1' }, { id: 'a2' }] } });
      assert.strictEqual(s.name, 'Deus sive Natura');
      assert.strictEqual(s.substance, 'unique');
      assert.strictEqual(s.infinite, true);
      assert.deepStrictEqual(s.attributes, ['pensée', 'étendue']);
      assert.strictEqual(s.modes.length, 2);
      assert.strictEqual(s.nature, 'natura naturans');
      assert.ok(s.description);
    });
    test('substanceUnique throws on missing system', () => {
      assert.throws(() => spinozaService.substanceUnique({}), /requires a system/);
    });
    test('conatus evaluates agent persistence', () => {
      const c = spinozaService.conatus({ agent: { id: 'agent-1', cognitive_budget: 0.8 } });
      assert.strictEqual(c.agentId, 'agent-1');
      assert.strictEqual(c.conatus, 'conatus sese conservandi');
      assert.strictEqual(c.vitality, 0.8);
      assert.strictEqual(c.persistence, 'stable');
      assert.strictEqual(c.effort, 'strong');
    });
    test('conatus detects declining agent', () => {
      const c = spinozaService.conatus({ agent: { id: 'agent-2', cognitive_budget: 0.2 } });
      assert.strictEqual(c.persistence, 'declining');
      assert.strictEqual(c.effort, 'weak');
    });
    test('conatus uses energy fallback', () => {
      const c = spinozaService.conatus({ agent: { id: 'agent-3', energy: 0.6 } });
      assert.strictEqual(c.vitality, 0.6);
      assert.strictEqual(c.persistence, 'stable');
    });
    test('conatus requires agent', () => {
      assert.throws(() => spinozaService.conatus({}), /requires an agent/);
    });
    test('attributesSpinoza maps thought and extension', () => {
      const a = spinozaService.attributesSpinoza({ agent: { id: 'agent-1', role: 'orchestrator', current_task: 'planning', cognitive_budget: 0.9, workspace_id: 'ws-1', parent_agent_id: null, status: 'running' } });
      assert.strictEqual(a.agentId, 'agent-1');
      assert.strictEqual(a.pensée.classification, 'orchestrator');
      assert.strictEqual(a.pensée.currentTask, 'planning');
      assert.strictEqual(a.pensée.cognitiveBudget, 0.9);
      assert.strictEqual(a.étendue.workspaceId, 'ws-1');
      assert.strictEqual(a.étendue.status, 'running');
      assert.ok(a.description);
    });
    test('attributesSpinoza throws on missing agent', () => {
      assert.throws(() => spinozaService.attributesSpinoza({}), /requires an agent/);
    });
    test('monismeSystème detects monistic system', () => {
      const m = spinozaService.monismeSystème({ agents: [{ substanceId: 'genos' }, { substanceId: 'genos' }] });
      assert.strictEqual(m.substanceCount, 1);
      assert.strictEqual(m.moniste, true);
      assert.strictEqual(m.agents, 2);
    });
    test('monismeSystème detects non-monistic system', () => {
      const m = spinozaService.monismeSystème({ agents: [{ substanceId: 's1' }, { substanceId: 's2' }] });
      assert.strictEqual(m.substanceCount, 2);
      assert.strictEqual(m.moniste, false);
    });
    test('monismeSystème requires agents array', () => {
      assert.throws(() => spinozaService.monismeSystème({}), /requires agents array/);
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
