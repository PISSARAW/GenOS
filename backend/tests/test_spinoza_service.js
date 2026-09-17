'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { closeDatabase, getDatabase } = require('../src/db');
const spinozaService = require('../src/services/spinozaService');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}: ${err.message}`); }
}

async function main() {
  const dbPath = path.join(__dirname, `spinoza-test-${Date.now()}.db`);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'spinoza-test-password';
  process.env.GENOS_ADMIN_TOKEN = process.env.GENOS_ADMIN_TOKEN || 'spinoza-test-token';
  try {
    const db = await getDatabase(dbPath);
    await db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, role TEXT, execution_mode TEXT, current_task TEXT, parent_agent_id TEXT, workspace_id TEXT, about TEXT, cognitive_budget REAL, dissonance_level REAL, is_apoptotic INTEGER, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, severity TEXT, payload_json TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS agent_memories (id TEXT PRIMARY KEY, agent_id TEXT, content TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT, problem TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_beings (id TEXT PRIMARY KEY, substance_type TEXT NOT NULL, essence_json TEXT NOT NULL DEFAULT '{}', identity_criteria_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, ceased_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_attributes (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, value_type TEXT NOT NULL, modality TEXT NOT NULL, provenance TEXT NOT NULL DEFAULT 'ontological', previous_value_json TEXT, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP, valid_from DATETIME DEFAULT CURRENT_TIMESTAMP, valid_until DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_modes (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, mode TEXT NOT NULL, mode_constraint TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'inactive', activation_condition_json TEXT, activated_at DATETIME, deactivated_at DATETIME, failure_reason TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_hypostatizations (id INTEGER PRIMARY KEY AUTOINCREMENT, source_being_id TEXT NOT NULL, attribute_key TEXT NOT NULL, target_being_id TEXT NOT NULL, essence_extracted_json TEXT NOT NULL, hypostatization_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME, reabsorbed_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_mereology (id INTEGER PRIMARY KEY AUTOINCREMENT, whole_id TEXT NOT NULL, part_id TEXT NOT NULL, relation_type TEXT NOT NULL, is_essential_part INTEGER DEFAULT 0, proportion REAL, attached_at DATETIME DEFAULT CURRENT_TIMESTAMP, detached_at DATETIME);
      CREATE TABLE IF NOT EXISTS ontology_identity_events (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, event_type TEXT NOT NULL, description TEXT, previous_essence_hash TEXT, new_essence_hash TEXT, continuity_preserved INTEGER DEFAULT 1, identity_score REAL DEFAULT 1.0, metadata_json TEXT DEFAULT '{}', occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS ontology_attribute_history (id INTEGER PRIMARY KEY AUTOINCREMENT, being_id TEXT NOT NULL, key TEXT NOT NULL, old_value_json TEXT, new_value_json TEXT NOT NULL, modality TEXT NOT NULL, changed_by TEXT, change_reason TEXT, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);

    console.log('\n=== Spinoza Service ===');
    test('substanceUnique describes system as single substance', () => {
      const s = spinozaService.substanceUnique({ system: { agents: [{ id: 'a1' }, { id: 'a2' }] } });
      assert.strictEqual(s.name, 'Deus sive Natura');
      assert.strictEqual(s.substance, 'unique');
      assert.strictEqual(s.infinite, true);
      assert.ok(s.attributes.includes('pensée'));
      assert.ok(s.attributes.includes('étendue'));
      assert.strictEqual(s.nature, 'natura naturans');
      assert.strictEqual(s.modes.length, 2);
    });
    test('substanceUnique throws on missing system', () => {
      assert.throws(() => spinozaService.substanceUnique({}), /requires a system/);
    });
    test('conatus evaluates persistence effort', () => {
      const c = spinozaService.conatus({ agent: { id: 'agent-1', cognitive_budget: 0.85 } });
      assert.strictEqual(c.agentId, 'agent-1');
      assert.strictEqual(c.vitality, 0.85);
      assert.strictEqual(c.persistence, 'stable');
      assert.strictEqual(c.effort, 'strong');
      assert.ok(c.conatus);
    });
    test('conatus shows declining when vitality is low', () => {
      const c = spinozaService.conatus({ agent: { id: 'agent-2', cognitive_budget: 0.2 } });
      assert.strictEqual(c.persistence, 'declining');
      assert.strictEqual(c.effort, 'weak');
    });
    test('conatus throws on missing agent', () => {
      assert.throws(() => spinozaService.conatus({}), /requires an agent/);
    });
    test('attributesSpinoza maps agent as mode of substance', () => {
      const a = spinozaService.attributesSpinoza({
        agent: {
          id: 'agent-1',
          role: 'orchestrator',
          current_task: 'orchestrate',
          cognitive_budget: 0.9,
          workspace_id: 'ws-1',
          parent_agent_id: 'orch-parent',
          status: 'running',
        },
      });
      assert.strictEqual(a.agentId, 'agent-1');
      assert.strictEqual(a.pensée.classification, 'orchestrator');
      assert.strictEqual(a.pensée.currentTask, 'orchestrate');
      assert.strictEqual(a.étendue.workspaceId, 'ws-1');
      assert.strictEqual(a.étendue.parent, 'orch-parent');
      assert.strictEqual(a.étendue.status, 'running');
      assert.ok(a.description.includes('mode de la substance unique'));
    });
    test('attributesSpinoza throws on missing agent', () => {
      assert.throws(() => spinozaService.attributesSpinoza({}), /requires an agent/);
    });
    test('monismeSystème evaluates monism degree', () => {
      const m = spinozaService.monismeSystème({
        agents: [
          { id: 'a1', substanceId: 'genos' },
          { id: 'a2', substanceId: 'genos' },
          { id: 'a3', substanceId: 'genos' },
        ],
      });
      assert.strictEqual(m.substanceCount, 1);
      assert.strictEqual(m.moniste, true);
      assert.strictEqual(m.agents, 3);
      assert.ok(m.description.includes('moniste'));
    });
    test('monismeSystème detects non-monism', () => {
      const m = spinozaService.monismeSystème({
        agents: [
          { id: 'a1', substanceId: 'genos' },
          { id: 'a2', substanceId: 'other' },
        ],
      });
      assert.strictEqual(m.substanceCount, 2);
      assert.strictEqual(m.moniste, false);
      assert.ok(m.description.includes('non-moniste'));
    });
    test('monismeSystème throws on invalid agents', () => {
      assert.throws(() => spinozaService.monismeSystème({}), /requires agents array/);
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
  } finally {
    await closeDatabase();
    ['', '-shm', '-wal'].forEach(s => { try { fs.unlinkSync(`${dbPath}${s}`); } catch (_) {} });
  }
  if (failed > 0) process.exit(1);
}
main().catch(err => { console.error('Test runner error:', err); process.exit(1); });
