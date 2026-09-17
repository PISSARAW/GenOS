'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { closeDatabase, getDatabase } = require('../src/db');
const newtonianService = require('../src/services/newtonianService');

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
  const dbPath = path.join(__dirname, `newtonian-test-${Date.now()}.db`);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'newtonian-test-password';
  process.env.GENOS_ADMIN_TOKEN = process.env.GENOS_ADMIN_TOKEN || 'newtonian-test-token';
  try {
    const db = await getDatabase(dbPath);
    await db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, role TEXT, execution_mode TEXT, current_task TEXT, parent_agent_id TEXT, workspace_id TEXT, about TEXT, cognitive_budget REAL, dissonance_level REAL, is_apoptotic INTEGER, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, severity TEXT, payload_json TEXT, created_at DATETIME);`);

    console.log('\n=== Newtonian Service ===');
    test('espaceAbsolu describes absolute space', () => {
      const e = newtonianService.espaceAbsolu({ system: {} });
      assert.strictEqual(e.type, 'espace_absolu');
      assert.strictEqual(e.fixe, true);
      assert.strictEqual(e.immuable, true);
      assert.strictEqual(e.independentCorps, true);
    });
    test('tempsAbsolu describes absolute time', () => {
      const t = newtonianService.tempsAbsolu({ system: {} });
      assert.strictEqual(t.type, 'temps_absolu');
      assert.strictEqual(t.uniforme, true);
      assert.strictEqual(t.continu, true);
    });
    test('mecaniqueClassique applies action-reaction', () => {
      const m = newtonianService.mecaniqueClassique({ agent1: { id: 'a1' }, agent2: { id: 'a2' }, force: 'push' });
      assert.strictEqual(m.agent1, 'a1');
      assert.strictEqual(m.agent2, 'a2');
      assert.strictEqual(m.actionReaction, true);
      assert.strictEqual(m.egaleEtOpposee, true);
    });
    test('inertie detects rest state', () => {
      const i = newtonianService.inertie({ agent: { id: 'a1', velocity: 0 } });
      assert.strictEqual(i.etat, 'repos');
      assert.strictEqual(i.acceleration, 0);
      assert.strictEqual(i.loi, 'première_loi_de_Newton');
    });
    test('inertie detects uniform motion', () => {
      const i = newtonianService.inertie({ agent: { id: 'a2', velocity: 5 } });
      assert.strictEqual(i.etat, 'mouvement_rectiligne_uniforme');
    });
    test('forceGravitationnelle computes attraction', () => {
      const f = newtonianService.forceGravitationnelle({ agent1: { id: 'a1', cognitive_budget: 10 }, agent2: { id: 'a2', cognitive_budget: 5 }, distance: 2 });
      assert.strictEqual(f.force, 12.5);
      assert.strictEqual(f.direction, 'attraction');
      assert.strictEqual(f.loi, 'gravitation_universelle');
    });
    test('forceGravitationnelle uses default G', () => {
      const f = newtonianService.forceGravitationnelle({ agent1: { id: 'a1', mass: 4 }, agent2: { id: 'a2', mass: 2 }, distance: 1 });
      assert.strictEqual(f.force, 8);
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
