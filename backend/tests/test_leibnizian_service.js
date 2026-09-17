'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { closeDatabase, getDatabase } = require('../src/db');
const leibnizianService = require('../src/services/leibnizianService');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}: ${err.message}`); }
}

async function main() {
  const dbPath = path.join(__dirname, `leibnizian-test-${Date.now()}.db`);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'leibnizian-test-password';
  process.env.GENOS_ADMIN_TOKEN = process.env.GENOS_ADMIN_TOKEN || 'leibnizian-test-token';
  try {
    const db = await getDatabase(dbPath);
    await db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, role TEXT, execution_mode TEXT, current_task TEXT, parent_agent_id TEXT, workspace_id TEXT, about TEXT, cognitive_budget REAL, dissonance_level REAL, is_apoptotic INTEGER, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, severity TEXT, payload_json TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS agent_memories (id TEXT PRIMARY KEY, agent_id TEXT, content TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT, problem TEXT, created_at DATETIME);`);

    console.log('\n=== Leibnizian Service ===');
    test('monadologie describes agent as monade', () => {
      const m = leibnizianService.monadologie({ agent: { id: 'a1' } });
      assert.strictEqual(m.substance, 'monade');
      assert.strictEqual(m.indivisible, true);
      assert.strictEqual(m.refleteUniverse, true);
    });
    test('harmoniePreEtablie evaluates coordination', () => {
      const h = leibnizianService.harmoniePreEtablie({ agent: { id: 'a1' }, schedule: ['t1', 't2'] });
      assert.strictEqual(h.harmonie, true);
      assert.strictEqual(h.interactionDirecte, false);
      assert.strictEqual(h.coordination, 'pre-etablie');
    });
    test('principeRaisonSuffisante validates reason', () => {
      const p = leibnizianService.principeRaisonSuffisante({ action: 'build', reason: 'mission requires it' });
      assert.strictEqual(p.hasReason, true);
      assert.strictEqual(p.valid, true);
      assert.strictEqual(p.principle, 'nihil est sine ratione');
    });
    test('loisDeContinuation checks continuity', () => {
      const l = leibnizianService.loisDeContinuation({ events: [{ timestamp: 1000 }, { timestamp: 1500 }] });
      assert.strictEqual(l.continuous, true);
      assert.strictEqual(l.gaps, 0);
      assert.strictEqual(l.law, 'natura non facit saltus');
    });
    test('calculRaisonSuffisante finds best cause', () => {
      const c = leibnizianService.calculRaisonSuffisante({ state: 'running', causes: [{ explanation: 'mission active' }] });
      assert.strictEqual(c.reasonFound, true);
      assert.strictEqual(c.bestCause.explanation, 'mission active');
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
  } finally {
    await closeDatabase();
    ['', '-shm', '-wal'].forEach(s => { try { fs.unlinkSync(`${dbPath}${s}`); } catch (_) {} });
  }
  if (failed > 0) process.exit(1);
}
main().catch(err => process.exit(1));
