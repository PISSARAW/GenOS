'use strict';
/**
 * @file test_memory_plasticity_concepts.js
 * @description Preuves d'exécution des concepts de mémoire, apprentissage et
 * plasticité finis dans ce commit : mémoire de travail, mémoire ancestrale,
 * héritage de risque, plasticité collective, teaching worker / transmission.
 */
const assert = require('assert');
const { createStore: createWorkingMemory, memorize: wmMemorize, recall: wmRecall,
  forget: wmForget, stats: wmStats, pruneStore: wmPrune } = require('../src/services/memory/workingMemoryService');
const { createStore: createAncestralMemory, memorize: amMemorize,
  recall: amRecall, forget: amForget, stats: amStats } = require('../src/services/memory/ancestralMemoryService');
const { createStore: createRiskInheritance, propagate: riPropagate,
  getRisk: riGetRisk, decay: riDecay, stats: riStats } = require('../src/services/memory/riskInheritanceService');
const { createStore: createCollectivePlasticity, update: cpUpdate,
  getWeight: cpGetWeight, aggregate: cpAggregate, decayAll: cpDecayAll,
  stats: cpStats } = require('../src/services/memory/collectivePlasticityService');
const { teach, verifyTransfer } = require('../src/services/memory/teachingWorkerService');

let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

// 1. Mémoire de travail : cache borné + TTL + oubli
ok('mémoire de travail : memorize/recall/forget/stats', () => {
  const wm = createWorkingMemory({ maxEntries: 3, defaultTtlMs: 50 });
  assert.strictEqual(wmMemorize(wm, 'a', { value: 1 }), true);
  assert.strictEqual(wmMemorize(wm, 'b', { value: 2 }), true);
  assert.strictEqual(wmMemorize(wm, 'c', { value: 3 }), true);
  assert.strictEqual(wmRecall(wm, 'a'), 1);
  assert.strictEqual(wmMemorize(wm, 'd', { value: 4 }), true);
  assert.strictEqual(wmRecall(wm, 'd'), 4);
  const s = wmStats(wm);
  assert.ok(Number.isInteger(s.size) && s.size <= 3);
  assert.strictEqual(typeof wmForget(wm, 'a'), 'number');
  wmPrune(wm);
});

// 2. Mémoire ancestrale : mémoriser/rappeler/oublier par lignée
ok('mémoire ancestrale : mémoriser/rappeler/oublier par lignée', () => {
  const am = createAncestralMemory();
  assert.strictEqual(amMemorize(am, {
    lineageId: 'L1', memoryId: 'm1', ancestorId: 'A1',
    memory: { fact: 'tool_use' }, salience: 0.9
  }), true);
  const recalled = amRecall(am, 'L1');
  assert.strictEqual(recalled.length, 1);
  assert.strictEqual(recalled[0].ancestorId, 'A1');
  assert.strictEqual(recalled[0].salience, 0.9);
  assert.strictEqual(amForget(am, 'L1', 'm1'), 1);
  assert.strictEqual(amRecall(am, 'L1').length, 0);
  const st = amStats(am);
  assert.ok(Number.isInteger(st.total));
});

// 3. Héritage de risque : propaguer/lire/décroître
ok('héritage de risque : propaguer/lire/décroître', () => {
  const ri = createRiskInheritance({ attenuation: 0.5 });
  assert.strictEqual(riPropagate(ri, {
    sourceId: 'S', targetId: 'T', risk: 0.8, lineageId: 'L1', depth: 1
  }), true);
  const risk = riGetRisk(ri, 'T', 'L1');
  assert.ok(risk !== null);
  assert.ok(risk.risk < 0.8 && risk.risk > 0, 'risque atténué');
  assert.strictEqual(risk.depth, 1);
  assert.strictEqual(riDecay(ri, 'L1', 0.5), 1);
  const after = riGetRisk(ri, 'T', 'L1');
  assert.ok(after.risk < risk.risk, 'decay atténue');
  assert.strictEqual(riGetRisk(ri, 'inconnu', 'L1'), null);
});

// 4. Plasticité collective : update/aggregate/decay
ok('plasticité collective : update/aggregate/decay', () => {
  const cp = createCollectivePlasticity({ learningRate: 0.2 });
  assert.deepStrictEqual(cpUpdate(cp, { channelId: 'c1', signal: 1.0 }),
    { channelId: 'c1', weight: 0.7, hits: 1 });
  const w = cpGetWeight(cp, 'c1');
  assert.strictEqual(w.weight, 0.7);
  const avg = cpAggregate(cp, ['c1', 'c2']);
  assert.ok(avg > 0 && avg <= 1);
  assert.strictEqual(cpDecayAll(cp), 1);
  const st = cpStats(cp);
  assert.strictEqual(st.channels, 1);
});

// 5. Teaching worker / transmission : transfert vérifié sur une instance
ok('teaching worker : transfert vérifié (succès)', () => {
  const input = [3, 4, 5];
  const r = teach({ procedureId: 'subset_sum', demonstration: 'indices',
    learnerIndices: [0, 1], input, target: 7 });
  assert.strictEqual(r.transferVerified, true);
  assert.strictEqual(r.verdict, 'transfer_ok');
  assert.strictEqual(r.receipt.verified, true);
});

ok('teaching worker : transfert échoué (indices invalides)', () => {
  const input = [3, 4, 5];
  const r = teach({ procedureId: 'subset_sum', learnerIndices: [0, 0], input, target: 6 });
  assert.strictEqual(r.transferVerified, false);
  assert.strictEqual(r.verdict, 'transfer_failed');
});

ok('verifyTransfer hors bornes / doublon', () => {
  assert.strictEqual(verifyTransfer([1, 2], [0, 0], 2), false);
  assert.strictEqual(verifyTransfer([1, 2], [0, 5], 6), false);
  assert.strictEqual(verifyTransfer([1, 2, 3], [0, 2], 4), true);
});

console.log(`\n${passed} preuves d'exécution OK (mémoire, apprentissage, plasticité).`);
process.exit(0);
