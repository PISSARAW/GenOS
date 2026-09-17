'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { closeDatabase, getDatabase } = require('../src/db');
const ontologyStances = require('../src/services/ontologyStances');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}: ${err.message}`); }
}

async function main() {
  const dbPath = path.join(__dirname, `stances-test-${Date.now()}.db`);
  try {
    const db = await getDatabase(dbPath);
    await db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, role TEXT, execution_mode TEXT, current_task TEXT, parent_agent_id TEXT, workspace_id TEXT, about TEXT, cognitive_budget REAL, dissonance_level REAL, is_apoptotic INTEGER, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE IF NOT EXISTS telemetry_events (id TEXT PRIMARY KEY, agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, severity TEXT, payload_json TEXT, created_at DATETIME);
      CREATE TABLE IF NOT EXISTS agent_memories (id TEXT PRIMARY KEY, agent_id TEXT, content TEXT, created_at DATETIME);`);

    console.log('\n=== Ontology Stances (Réalisme / Nominalisme / Conceptualisme) ===');
    test('classifyTerm with realism stance', () => {
      const r = ontologyStances.classifyTerm({ term: 'humanité', stance: 'realism' });
      assert.strictEqual(r.term, 'humanité');
      assert.strictEqual(r.stance, 'realism');
      assert.strictEqual(r.status, 'universel');
      assert.ok(r.implication);
    });
    test('classifyTerm with nominalism stance', () => {
      const n = ontologyStances.classifyTerm({ term: 'humanité', stance: 'nominalism' });
      assert.strictEqual(n.term, 'humanité');
      assert.strictEqual(n.stance, 'nominalism');
      assert.strictEqual(n.status, 'particulier');
    });
    test('classifyTerm with conceptualism stance', () => {
      const c = ontologyStances.classifyTerm({ term: 'humanité', stance: 'conceptualism' });
      assert.strictEqual(c.term, 'humanité');
      assert.strictEqual(c.stance, 'conceptualism');
      assert.strictEqual(c.status, 'concept');
    });
    test('classifyTerm throws on invalid stance', () => {
      assert.throws(() => ontologyStances.classifyTerm({ term: 'x', stance: 'fake' }), /Invalid stance/);
    });
    test('classifyTerm throws on missing term', () => {
      assert.throws(() => ontologyStances.classifyTerm({ stance: 'realism' }), /requires term/);
    });
    test('evaluateStanceCoherence returns coherent for compatible signal', () => {
      const e = ontologyStances.evaluateStanceCoherence({
        agentId: 'a1',
        stance: 'realism',
        observables: [{ signal: 'essential_form' }],
      });
      assert.strictEqual(e.agentId, 'a1');
      assert.strictEqual(e.stance, 'realism');
      assert.strictEqual(e.verdict, 'coherent');
      assert.strictEqual(e.coherence, 1);
      assert.strictEqual(e.violations.length, 0);
    });
    test('evaluateStanceCoherence returns partial for incompatible signal', () => {
      const e = ontologyStances.evaluateStanceCoherence({
        agentId: 'a2',
        stance: 'realism',
        observables: [{ signal: 'purely_conceptual' }],
      });
      assert.strictEqual(e.verdict, 'partiel');
      assert.ok(e.coherence < 1);
      assert.ok(e.violations.length > 0);
    });
    test('evaluateStanceCoherence throws on invalid stance', () => {
      assert.throws(() => ontologyStances.evaluateStanceCoherence({ agentId: 'x', stance: 'bad' }), /Invalid stance/);
    });
    test('debateStances returns all three stances', () => {
      const debate = ontologyStances.debateStances();
      assert.ok(debate.length >= 3);
      const names = debate.map(d => d.stance);
      assert.ok(names.includes('realism'));
      assert.ok(names.includes('nominalism'));
      assert.ok(names.includes('conceptualism'));
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
  } finally {
    await closeDatabase();
    ['', '-shm', '-wal'].forEach(s => { try { fs.unlinkSync(`${dbPath}${s}`); } catch (_) {} });
  }
  if (failed > 0) process.exit(1);
}
main().catch(err => { console.error('Test runner error:', err); process.exit(1); });
