'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const mutation = require('../src/services/proceduralMutationSelectionService');
const runtime = require('../src/services/proceduralRuntimeService');
const persistence = require('../src/services/proceduralPersistenceService');
const learning = require('../src/services/proceduralLearningCycleService');
const identity = require('../src/services/proceduralIdentityService');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function makeParent() {
  return identity.sealOrganism({
    apiVersion: 'genos/v1alpha1',
    kind: 'ProceduralOrganism',
    metadata: { version: 1, parentId: null, lineageId: 'lineage-pareto' },
    structure: {
      nodes: [
        { id: 'start', type: 'action', required: true, locked: true },
        { id: 'verify', type: 'gate', required: true, locked: true },
        { id: 'end', type: 'terminal', required: true },
      ],
      synapses: [
        { from: 'start', to: 'verify', type: 'excitatory', weight: 0.8 },
        { from: 'verify', to: 'end', type: 'excitatory', weight: 0.9 },
      ],
    },
    fitness: { score: 0.5, components: { success: 0.5, robustness: 0.5, evidence: 0.6, risk: 0.1 } },
  });
}

async function testParetoAndNiche() {
  // Pareto front with 3 candidates:
  // A: high success, low robustness — non-dominated
  // B: low success, high robustness — non-dominated
  // C: medium on both — dominated by A on success, by B on robustness → dominated
  const variants = [
    { id: 'a', parentId: 'p1', fitness: { score: 0.9, components: { success: 0.9, robustness: 0.3, evidence: 0.7, generalization: 0.5 } } },
    { id: 'b', parentId: 'p1', fitness: { score: 0.6, components: { success: 0.3, robustness: 0.9, evidence: 0.5, generalization: 0.4 } } },
    { id: 'c', parentId: 'p1', fitness: { score: 0.7, components: { success: 0.6, robustness: 0.6, evidence: 0.6, generalization: 0.5 } } },
    { id: 'd', parentId: 'p2', fitness: { score: 0.8, components: { success: 0.8, robustness: 0.8, evidence: 0.9, generalization: 0.7 } } },
  ];

  const front = mutation.paretoFront(variants, ['success', 'robustness', 'evidence', 'generalization']);
  // d dominates c (d is >= on all, > on all). a and b are non-dominated (trade-off).
  // c is dominated by d (d has higher success AND higher robustness).
  const frontIds = front.map((v) => v.id);
  assert.ok(frontIds.includes('a'), 'A should be on Pareto front');
  assert.ok(frontIds.includes('b'), 'B should be on Pareto front');
  assert.ok(frontIds.includes('d'), 'D should be on Pareto front');
  assert.ok(!frontIds.includes('c'), 'C should NOT be on Pareto front (dominated by D)');

  // Niche selection: max 2 per niche
  const niched = mutation.nicheSelection(variants, { maxPerNiche: 2 });
  const nicheP1 = niched.filter((v) => v.parentId === 'p1');
  const nicheP2 = niched.filter((v) => v.parentId === 'p2');
  assert.ok(nicheP1.length <= 2, 'max 2 per niche for p1');
  assert.ok(nicheP2.length <= 2, 'max 2 per niche for p2');

  console.log('=== Pareto/niche selection: all passed ===');
}

async function testLearningCycle() {
  const synapse = { from: 'start', to: 'patch', type: 'excitatory', weight: 0.8, plasticity: { weight: 0.8, potentiationCount: 0, depressionCount: 0 } };
  const episodes = [
    { trajectory: ['start', 'patch'], outcome: 'failure', context: {}, success: false },
    { trajectory: ['start', 'patch'], outcome: 'failure', context: {}, success: false },
    { trajectory: ['start', 'patch'], outcome: 'failure', context: {}, success: false },
  ];

  // Positive surprise: observed > expected → LTP
  const ltpResult = learning.runLearningCycle({ expectedReward: 0.2, observedReward: 0.9, synapse, episodes, options: {} });
  assert.ok(ltpResult.surprise.isSurprising, 'positive surprise detected');
  assert.ok(ltpResult.surprise.triggerLTP, 'LTP triggered');
  assert.ok(!ltpResult.surprise.triggerMutationSearch, 'no mutation search for positive surprise');

  // Negative surprise: observed < expected → LTD + mutation search
  const ltdResult = learning.runLearningCycle({ expectedReward: 0.8, observedReward: 0.1, synapse, episodes, options: {} });
  assert.ok(ltdResult.surprise.isSurprising, 'negative surprise detected');
  assert.ok(ltdResult.surprise.triggerLTD, 'LTD triggered');
  assert.ok(ltdResult.surprise.triggerMutationSearch, 'mutation search triggered');

  // Consolidation: mix of success episodes with common subpath → should consolidate
  const mixedEpisodes = [
    { trajectory: ['start', 'verify', 'end'], outcome: 'success', context: {}, success: true },
    { trajectory: ['start', 'verify', 'end'], outcome: 'success', context: {}, success: true },
    { trajectory: ['start', 'verify', 'end'], outcome: 'success', context: {}, success: true },
  ];
  const consResult = learning.runLearningCycle({ expectedReward: 0.8, observedReward: 0.1, synapse, episodes: mixedEpisodes, options: {} });
  assert.ok(consResult.consolidation, 'consolidation result present');
  assert.ok(consResult.consolidation.consolidated, 'golden path consolidated');

  // No surprise: expected == observed → no structural change
  const noChange = learning.runLearningCycle({ expectedReward: 0.5, observedReward: 0.5, synapse, episodes: [], options: {} });
  assert.ok(!noChange.surprise.isSurprising, 'no surprise when expected==observed');
  assert.ok(!noChange.surprise.triggerLTD, 'no LTD');
  assert.ok(!noChange.surprise.triggerLTP, 'no LTP');

  console.log('=== procedural learning cycle: all passed ===');
}

async function testRuntimeParetoIntegration() {
  const dbPath = path.join(__dirname, `test-procedural-pareto-${Date.now()}.db`);
  const db = new sqlite3.Database(dbPath);
  for (const stmt of persistence.TABLE_SQL.split(';').filter((s) => s.trim())) {
    await run(db, stmt);
  }

  const parent = makeParent();
  const savedParent = await persistence.persistGenome(db, parent, { status: 'active' });
  assert.ok(savedParent.metadata.id);

  // Run evolution cycle with Pareto/niche selection
  const result = await runtime.runEvolutionCycle(db, savedParent, {
    variantCount: 8,
    policy: { minEvidence: 0.5, minRobustness: 0.3, maxNodes: 100 },
    fitnessMetrics: (variant) => ({
      success: 0.7 + Math.random() * 0.3,
      robustness: 0.5 + Math.random() * 0.4,
      evidence: 0.6 + Math.random() * 0.3,
      generalization: 0.4 + Math.random() * 0.4,
      cost: 0.1 + Math.random() * 0.2,
      risk: 0.05 + Math.random() * 0.1,
      complexity: 0.2 + Math.random() * 0.2,
    }),
  });

  assert.strictEqual(result.promoted, true, 'cycle must promote');
  assert.ok(result.paretoCount >= 1, 'at least one Pareto-optimal candidate');
  assert.ok(result.nicheCount >= 1, 'at least one niche survivor');
  assert.ok(result.nicheCount <= result.viableCount, 'niche count <= viable count');
  assert.ok(result.promotedId, 'promoted id present');

  // Promoted candidate must be loadable and valid
  const loaded = await persistence.loadGenome(db, result.promotedId);
  assert.ok(loaded, 'promoted candidate loadable');
  const validation = identity.validateOrganism(loaded);
  assert.strictEqual(validation.valid, true, `promoted candidate valid: ${validation.errors.join('; ')}`);

  db.close();
  fs.unlinkSync(dbPath);
  console.log('=== runtime Pareto integration: all passed ===');
}

async function main() {
  await testParetoAndNiche();
  await testLearningCycle();
  await testRuntimeParetoIntegration();
  console.log('=== ALL TESTS PASSED ===');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
