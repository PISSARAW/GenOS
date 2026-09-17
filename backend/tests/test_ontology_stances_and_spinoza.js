'use strict';
const assert = require('assert');
const ontologyStances = require('../src/services/ontologyStances');
const spinozaService = require('../src/services/spinozaService');
const temporalIdentityService = require('../src/services/temporalIdentityService');
const { getDatabase, closeDatabase } = require('../src/db');
const path = require('path');

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
  const dbPath = path.join(__dirname, `stance-test-${Date.now()}.db`);
  process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'stance-test-password';
  process.env.GENOS_ADMIN_TOKEN = process.env.GENOS_ADMIN_TOKEN || 'stance-test-token';
  try {
    const db = await getDatabase(dbPath);
    await db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT, status TEXT, role TEXT, execution_mode TEXT, current_task TEXT, parent_agent_id TEXT, workspace_id TEXT, about TEXT, cognitive_budget REAL, is_apoptotic INTEGER, created_at DATETIME, updated_at DATETIME);
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
    test('evaluateStanceCoherence accepts a coherent realist form', () => {
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
    test('evaluateStanceCoherence fully coherent', () => {
      const e = ontologyStances.evaluateStanceCoherence({
        agentId: 'a2',
        stance: 'nominalism',
        observables: [{ signal: 'purely_conceptual' }],
      });
      assert.strictEqual(e.verdict, 'coherent');
      assert.strictEqual(e.coherence, 1);
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

    console.log('\n=== Spinoza Service ===');
    test('substanceUnique returns unique infinite substance', () => {
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

    console.log('\n=== Temporal Identity Service ===');
    test('aSeriesPosition returns past/present/future', () => {
      const events = [
        { id: 'e1', created_at: '2026-01-01T00:00:00Z', type: 'telemetry' },
        { id: 'e2', created_at: '2026-01-02T00:00:00Z', type: 'telemetry' },
      ];
      const pos = temporalIdentityService.aSeriesPosition(events);
      assert.strictEqual(pos.past.length, 1);
      assert.strictEqual(pos.present.id, 'e2');
      assert.strictEqual(pos.present.tense, 'present');
      assert.strictEqual(pos.future.length, 0);
    });
    test('aSeriesPosition empty array', () => {
      const pos = temporalIdentityService.aSeriesPosition([]);
      assert.strictEqual(pos.past.length, 0);
      assert.strictEqual(pos.present, null);
      assert.strictEqual(pos.future.length, 0);
    });
    test('shipOfTheseus with low replacement preserves identity', async () => {
      await db.run(`INSERT OR REPLACE INTO agents (id, name, status, role, about, created_at, updated_at) VALUES ('theseus-1', 'Thésée', 'running', 'explorer', 'happiness sadness kindness toughness weakness darkness', datetime('now'), datetime('now'))`);
      const result = await temporalIdentityService.shipOfTheseus({ db, agentId: 'theseus-1', replacedComponents: ['sail', 'mast'] });
      assert.strictEqual(result.agentId, 'theseus-1');
      assert.strictEqual(result.identityPreserved, true);
      assert.ok(result.totalComponents > 1);
    });
    test('shipOfTheseus with high replacement compromises identity', async () => {
      const result = await temporalIdentityService.shipOfTheseus({ db, agentId: 'theseus-1', replacedComponents: ['sail', 'mast', 'hull', 'rudder', 'anchor', 'cabin'] });
      assert.strictEqual(result.agentId, 'theseus-1');
      assert.strictEqual(result.identityPreserved, false);
      assert.ok(result.replacementRatio > 0.5);
    });
    test('shipOfTheseus throws on missing agentId', () => {
      assert.rejects(() => temporalIdentityService.shipOfTheseus({ db, agentId: null }), /requires agentId/);
    });

    await testChain;
    console.log(`\n${passed} passed, ${failed} failed\n`);
  } finally {
    await closeDatabase();
    ['', '-shm', '-wal'].forEach(s => { try { fs.unlinkSync(`${dbPath}${s}`); } catch (_) {} });
  }
  if (failed > 0) process.exit(1);
}
main().catch(err => { console.error('Test runner error:', err); process.exit(1); });
