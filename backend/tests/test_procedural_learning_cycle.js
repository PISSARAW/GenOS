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
  // Niches are ECOLOGICAL (environmentId via the sealed evaluation receipt),
  // not lineages: a/b live in env-frontend, c/d in env-backend.
  function withEnv(v, env) {
    return {
      ...v,
      sealed: { evaluationReceipt: { environmentId: env } },
    };
  }
  const variants = [
    withEnv({ id: 'a', parentId: 'p1', fitness: { score: 0.9, components: { success: 0.9, robustness: 0.3, evidence: 0.7, generalization: 0.5 } } }, 'env-frontend'),
    withEnv({ id: 'b', parentId: 'p1', fitness: { score: 0.6, components: { success: 0.3, robustness: 0.9, evidence: 0.5, generalization: 0.4 } } }, 'env-frontend'),
    withEnv({ id: 'c', parentId: 'p1', fitness: { score: 0.7, components: { success: 0.6, robustness: 0.6, evidence: 0.6, generalization: 0.5 } } }, 'env-backend'),
    withEnv({ id: 'd', parentId: 'p2', fitness: { score: 0.8, components: { success: 0.8, robustness: 0.8, evidence: 0.9, generalization: 0.7 } } }, 'env-backend'),
  ];

  const front = mutation.paretoFront(variants, ['success', 'robustness', 'evidence', 'generalization']);
  // d dominates c (d is >= on all, > on all). a and b are non-dominated (trade-off).
  // c is dominated by d (d has higher success AND higher robustness).
  const frontIds = front.map((v) => v.id);
  assert.ok(frontIds.includes('a'), 'A should be on Pareto front');
  assert.ok(frontIds.includes('b'), 'B should be on Pareto front');
  assert.ok(frontIds.includes('d'), 'D should be on Pareto front');
  assert.ok(!frontIds.includes('c'), 'C should NOT be on Pareto front (dominated by D)');

  // Niche selection: max 2 per ECOLOGICAL niche (environmentId)
  const niched = mutation.nicheSelection(variants, { maxPerNiche: 2 });
  const nicheFront = niched.filter((v) => v.sealed.evaluationReceipt.environmentId === 'env-frontend');
  const nicheBack = niched.filter((v) => v.sealed.evaluationReceipt.environmentId === 'env-backend');
  assert.ok(nicheFront.length <= 2, 'max 2 per niche for env-frontend');
  assert.ok(nicheBack.length <= 2, 'max 2 per niche for env-backend');
  // Same lineage in two environments must NOT collapse into one niche:
  // a and c share parentId p1 but live in different niches.
  assert.strictEqual(mutation.nicheKey(variants[0]), 'env-frontend');
  assert.strictEqual(mutation.nicheKey(variants[2]), 'env-backend');

  console.log('=== Pareto/niche selection: all passed ===');
}

async function testSealedFitnessWiring() {
  // Regression test: runtime variants carry fitness:null with the evaluated
  // fitness under sealed.fitness. Pareto/niche must read the SEALED fitness,
  // otherwise every candidate scores 0 and the best can be eliminated.
  function sealedVariant(id, score, comps) {
    return {
      id,
      parentId: 'p0',
      fitness: null,
      sealed: {
        fitness: { score, components: comps },
        evaluationReceipt: { environmentId: 'env-test' },
      },
    };
  }
  const viable = [
    sealedVariant('v-low', 0.52, { success: 0.75, robustness: 0.65, evidence: 0.70, generalization: 0.55 }),
    sealedVariant('v-mid', 0.64, { success: 0.88, robustness: 0.80, evidence: 0.85, generalization: 0.70 }),
    sealedVariant('v-best', 0.71, { success: 0.95, robustness: 0.92, evidence: 0.90, generalization: 0.80 }),
  ];
  const front = mutation.paretoFront(viable, ['success', 'robustness', 'evidence', 'generalization']);
  const frontIds = front.map((v) => v.id);
  assert.ok(frontIds.includes('v-best'), 'best sealed candidate must survive Pareto');
  assert.ok(!frontIds.includes('v-low'), 'dominated sealed candidate must be eliminated');
  assert.ok(!frontIds.includes('v-mid'), 'dominated sealed candidate must be eliminated');
  const niched = mutation.nicheSelection(front, { maxPerNiche: 1 });
  assert.strictEqual(niched.length, 1);
  assert.strictEqual(niched[0].id, 'v-best', 'niche winner must be the best sealed fitness');
  assert.strictEqual(mutation.fitnessScore(viable[0]), 0.52, 'fitnessScore reads sealed fitness');

  console.log('=== sealed fitness wiring: all passed ===');
}

async function testReceiptIntegrity() {
  // A well-formed receipt passes; tampered metrics or a rebound receipt fail.
  const parent = { metadata: { id: 'parent-1' } };
  const variant = { id: 'v-draft-1', parentId: 'parent-1' };
  const metrics = { success: 0.8, robustness: 0.7, evidence: 0.9, generalization: 0.6 };
  const receipt = {
    candidateId: 'v-draft-1',
    parentId: 'parent-1',
    evaluatorId: 'test-evaluator',
    runnerId: null,
    environmentId: null,
    snapshotId: null,
    trials: 1,
    metrics: { ...metrics },
  };
  receipt.evaluationHash = runtime.evaluationHashFor(receipt);
  const sealed = {
    fitness: { score: 0.5, components: { ...metrics, cost: 0, risk: 0, complexity: 0 } },
    evaluationReceipt: receipt,
  };
  const ok = runtime.checkReceiptIntegrity({ sealed, variant, parent });
  assert.strictEqual(ok.valid, true, `valid receipt must pass: ${ok.errors.join('; ')}`);

  const tampered = JSON.parse(JSON.stringify(sealed));
  tampered.evaluationReceipt.metrics.success = 0.99;
  const bad = runtime.checkReceiptIntegrity({ sealed: tampered, variant, parent });
  assert.strictEqual(bad.valid, false, 'tampered metrics must fail integrity');

  const rebound = JSON.parse(JSON.stringify(sealed));
  rebound.evaluationReceipt.parentId = 'other-parent';
  const bad2 = runtime.checkReceiptIntegrity({ sealed: rebound, variant, parent });
  assert.strictEqual(bad2.valid, false, 'rebound receipt (wrong parent) must fail');

  console.log('=== receipt integrity: all passed ===');
}

async function testAdaptiveRecall() {
  // Immune memory recorded for a structural violation must recall a variant
  // with the same operation/target signature; fitness rejections must NOT
  // pollute immune memory.
  runtime.resetAdaptiveMemory();
  const parent = makeParent();
  const evilOps = [{ op: 'REMOVE_NODE', target: { id: 'verify', type: 'gate' }, before: { nodes: [{ id: 'verify', type: 'gate', required: true }] }, after: { nodes: [] } }];
  const evil = { id: 'v-evil', parentId: parent.metadata.id, operations: evilOps };
  const r1 = runtime.assessCandidate(parent, evil, {});
  assert.strictEqual(r1.rejected, true, 'required-gate removal must be rejected');
  assert.strictEqual(r1.stage, 'immune', 'required-gate removal must reject at immune stage');
  assert.strictEqual(runtime.getAdaptiveMemory().length, 1, 'immune rejection creates one structural signature');
  const sig = runtime.getAdaptiveMemory()[0];
  assert.ok(sig.structuralPattern, 'signature must carry a structural pattern');
  assert.ok(sig.structuralPattern.operationTypes.includes('REMOVE_NODE'), 'pattern must name the operation');

  // Recall: same structural signature (op + gate target) is rejected even
  // though its lexical JSON differs from the memorized pattern.
  const evil2 = {
    id: 'v-evil-2',
    parentId: parent.metadata.id,
    operations: [{ op: 'REMOVE_NODE', target: { id: 'verify', type: 'gate' }, before: {}, after: {} }],
  };
  const recall = runtime.inspectVariant(evil2);
  assert.strictEqual(recall.rejected, true, 'structural recall must reject the same attack signature');

  // A benign operation on a different target type must NOT match.
  const benign = {
    id: 'v-benign',
    parentId: parent.metadata.id,
    operations: [{ op: 'ADD_NODE', target: { id: 'n1', type: 'action' }, before: {}, after: {} }],
  };
  const benignReport = runtime.inspectVariant(benign);
  assert.strictEqual(benignReport.rejected, false, 'different op/target must not recall');

  // Fitness/evidence rejection must NOT create immune memory (no auto-immune).
  const before = runtime.getAdaptiveMemory().length;
  const drafts = mutation.generateVariants(parent, 2);
  assert.ok(drafts.length >= 1, 'need at least one draft variant');
  const weak = runtime.assessCandidate(parent, drafts[0], {
    policy: { minEvidence: 0.99 },
    fitnessMetrics: () => ({ success: 0.9, robustness: 0.9, evidence: 0.1, generalization: 0.9 }),
  });
  assert.strictEqual(weak.rejected, true, 'weak evidence must be rejected');
  assert.notStrictEqual(weak.stage, 'immune', 'evidence failure is not an immune rejection');
  assert.strictEqual(runtime.getAdaptiveMemory().length, before, 'fitness rejection must not pollute immune memory');
  runtime.resetAdaptiveMemory();

  console.log('=== adaptive recall: all passed ===');
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

// Deterministic metrics per operation: ADJUST_WEIGHT (index 4) strictly
// dominates on every Pareto objective, ADD_SYNAPSE is second, ADD_NODE
// third. Generation order (ADD_NODE first) differs from fitness order, so
// a Pareto/niche stage reading fitness 0 would eliminate the true winner.
const PARETO_METRICS_BY_OPERATION = {
  ADD_NODE: { success: 0.75, robustness: 0.65, evidence: 0.70, generalization: 0.55, cost: 0.15, risk: 0.05, complexity: 0.25 },
  REMOVE_NODE: { success: 0.45, robustness: 0.45, evidence: 0.55, generalization: 0.40, cost: 0.10, risk: 0.08, complexity: 0.15 },
  ADD_SYNAPSE: { success: 0.88, robustness: 0.80, evidence: 0.85, generalization: 0.70, cost: 0.10, risk: 0.04, complexity: 0.20 },
  REMOVE_SYNAPSE: { success: 0.50, robustness: 0.50, evidence: 0.55, generalization: 0.45, cost: 0.10, risk: 0.08, complexity: 0.15 },
  ADJUST_WEIGHT: { success: 0.95, robustness: 0.92, evidence: 0.90, generalization: 0.80, cost: 0.08, risk: 0.02, complexity: 0.15 },
};

function paretoFitnessMetrics(variant) {
  const op = variant.operations[0] && variant.operations[0].op;
  return { ...(PARETO_METRICS_BY_OPERATION[op] || PARETO_METRICS_BY_OPERATION.ADD_NODE) };
}

function bestSealedScore(attempts) {
  let best = -1;
  for (const attempt of attempts) {
    if (attempt.rejected || !attempt.sealed) continue;
    const score = Number(attempt.sealed.fitness && attempt.sealed.fitness.score);
    if (Number.isFinite(score) && score > best) best = score;
  }
  return best;
}

function isWinnerAttempt(attempt, promotedId) {
  return !attempt.rejected && attempt.sealed && attempt.sealed.metadata && attempt.sealed.metadata.id === promotedId;
}

function assertWinnerIsBest(result, expectedOp) {
  const winner = result.attempts.find((a) => isWinnerAttempt(a, result.promotedId));
  assert.ok(winner, 'promoted candidate must be among assessed attempts');
  assert.strictEqual(winner.operation, expectedOp, `winner must be ${expectedOp}, got ${winner.operation}`);
  assert.strictEqual(Number(winner.sealed.fitness.score), bestSealedScore(result.attempts), 'winner must carry the best sealed fitness score');
}

async function closeAndCleanDb(db, dbPath) {
  await new Promise((resolve) => db.close(resolve));
  try {
    fs.unlinkSync(dbPath);
  } catch (e) {
    if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e;
  }
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
    variantCount: 5,
    policy: { minEvidence: 0.5, minRobustness: 0.3, maxNodes: 100 },
    fitnessMetrics: paretoFitnessMetrics,
  });

  assert.strictEqual(result.promoted, true, 'cycle must promote');
  assert.ok(result.paretoCount >= 1, 'at least one Pareto-optimal candidate');
  assert.ok(result.nicheCount >= 1, 'at least one niche survivor');
  assert.ok(result.nicheCount <= result.viableCount, 'niche count <= viable count');
  assert.ok(result.promotedId, 'promoted id present');

  // The winner must be the true best candidate, not the first generated:
  // ADJUST_WEIGHT dominates on every objective and on sealed score.
  assertWinnerIsBest(result, 'ADJUST_WEIGHT');

  // Promoted candidate must be loadable and valid
  const loaded = await persistence.loadGenome(db, result.promotedId);
  assert.ok(loaded, 'promoted candidate loadable');
  const validation = identity.validateOrganism(loaded);
  assert.strictEqual(validation.valid, true, `promoted candidate valid: ${validation.errors.join('; ')}`);

  await closeAndCleanDb(db, dbPath);
  console.log('=== runtime Pareto integration: all passed ===');
}

async function main() {
  await testParetoAndNiche();
  await testSealedFitnessWiring();
  await testReceiptIntegrity();
  await testAdaptiveRecall();
  await testLearningCycle();
  await testRuntimeParetoIntegration();
  console.log('=== ALL TESTS PASSED ===');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
