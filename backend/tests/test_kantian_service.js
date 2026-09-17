'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { closeDatabase, getDatabase } = require('../src/db');
const kantianService = require('../src/services/kantianService');

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
  const dbPath = path.join(__dirname, `kantian-test-${Date.now()}.db`);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'kantian-test-password';
  process.env.GENOS_ADMIN_TOKEN = process.env.GENOS_ADMIN_TOKEN || 'kantian-test-token';
  try {
    const db = await getDatabase(dbPath);
    await db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, role TEXT, execution_mode TEXT, current_task TEXT, parent_agent_id TEXT, workspace_id TEXT, about TEXT, cognitive_budget REAL, dissonance_level REAL, is_apoptotic INTEGER, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, severity TEXT, payload_json TEXT, created_at DATETIME);`);

    console.log('\n=== Kantian Service ===');
    test('phenomene describes observable experience', () => {
      const p = kantianService.phenomene({ agent: { id: 'a1' }, observation: 'sensor data' });
      assert.strictEqual(p.type, 'phénomène');
      assert.strictEqual(p.observable, true);
      assert.strictEqual(p.experience, 'sensor data');
      assert.ok(p.categories.includes('espace'));
      assert.ok(p.categories.includes('causalité'));
    });
    test('noumene describes inaccessible thing-in-itself', () => {
      const n = kantianService.noumene({ chose: 'liberte' });
      assert.strictEqual(n.type, 'noumène');
      assert.strictEqual(n.accessible, false);
      assert.strictEqual(n.observable, false);
    });
    test('categoriesAPriori returns a priori structures', () => {
      const c = kantianService.categoriesAPriori();
      assert.strictEqual(c.type, 'a priori');
      assert.strictEqual(c.categories.length, 6);
      assert.ok(c.categories.includes('unité'));
      assert.ok(c.categories.includes('totalité'));
    });
    test('critiqueRaisonPure evaluates knowledge limits', () => {
      const cr = kantianService.critiqueRaisonPure({ agent: { id: 'a1' } });
      assert.ok(cr.connaissable.includes('phénomène'));
      assert.ok(cr.inconnaissable.includes('noumène'));
      assert.ok(cr.limites);
    });
    test('choseEnSoi distinguishes perception from thing-in-itself', () => {
      const cs = kantianService.choseEnSoi({ agent: { id: 'a1' }, representation: 'perception' });
      assert.strictEqual(cs.limitesLesConnaissances, true);
      assert.strictEqual(cs.representation, 'représentation subjective');
    });

    await testChain;
    console.log(`\n${passed} passed, ${failed} failed\n`);
  } finally {
    await closeDatabase();
    ['', '-shm', '-wal'].forEach(s => { try { fs.unlinkSync(`${dbPath}${s}`); } catch (_) {} });
  }
  if (failed > 0) process.exit(1);
}
main().catch(err => process.exit(1));
