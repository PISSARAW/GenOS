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
      CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, severity TEXT, payload_json TEXT, created_at DATETIME);`);

    console.log('\n=== Spinoza Service ===');
    test('substanceUnique describes single substance', () => {
      const s = spinozaService.substanceUnique({ system: { agents: ['a1', 'a2'] } });
      assert.strictEqual(s.name, 'Deus sive Natura');
      assert.strictEqual(s.substance, 'unique');
      assert.strictEqual(s.infinite, true);
      assert.deepStrictEqual(s.attributes, ['pensée', 'étendue']);
    });
    test('conatus evaluates persistence effort', () => {
      const c = spinozaService.conatus({ agent: { id: 'a1', cognitive_budget: 0.8 } });
      assert.strictEqual(c.conatus, 'conatus sese conservandi');
      assert.strictEqual(c.vitality, 0.8);
      assert.strictEqual(c.persistence, 'stable');
      assert.strictEqual(c.effort, 'strong');
    });
    test('conatus detects declining agent', () => {
      const c = spinozaService.conatus({ agent: { id: 'a2', cognitive_budget: 0.2 } });
      assert.strictEqual(c.persistence, 'declining');
      assert.strictEqual(c.effort, 'weak');
    });
    test('attributesSpinoza maps pensée and étendue', () => {
      const a = spinozaService.attributesSpinoza({ agent: { id: 'a1', role: 'worker', current_task: 'build', cognitive_budget: 0.9, workspace_id: 'ws-1', status: 'running' } });
      assert.strictEqual(a.pensée.classification, 'worker');
      assert.strictEqual(a.pensée.cognitiveBudget, 0.9);
      assert.strictEqual(a.étendue.workspaceId, 'ws-1');
      assert.strictEqual(a.étendue.status, 'running');
    });
    test('monismeSystème evaluates system monism', () => {
      const m = spinozaService.monismeSystème({ agents: [{ substanceId: 'genos' }, { substanceId: 'genos' }] });
      assert.strictEqual(m.moniste, true);
      assert.strictEqual(m.substanceCount, 1);
      assert.strictEqual(m.agents, 2);
    });
    test('monismeSystème detects non-monisme', () => {
      const m = spinozaService.monismeSystème({ agents: [{ substanceId: 'genos' }, { substanceId: 'ext' }] });
      assert.strictEqual(m.moniste, false);
      assert.strictEqual(m.substanceCount, 2);
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
  } finally {
    await closeDatabase();
    ['', '-shm', '-wal'].forEach(s => { try { fs.unlinkSync(`${dbPath}${s}`); } catch (_) {} });
  }
  if (failed > 0) process.exit(1);
}
main().catch(err => process.exit(1));
