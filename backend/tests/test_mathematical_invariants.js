'use strict';

/**
 * @file test_mathematical_invariants.js
 * @description Adversarial tests for scientific invariants of the Mathematical Organism.
 * These tests verify that the system enforces its claimed invariants under attack.
 */

const assert = require('node:assert');
const math = require('../src/services/mathematical');
const { createFormalResult } = require('../src/services/formalResultService');
const { MathematicalDependencyGraph } = require('../src/services/epistemicScheduler/mathematicalDependencyGraph');
const { LeanIncrementalGate } = require('../src/services/epistemicScheduler/leanIncrementalGate');

console.log('=== Running Adversarial Invariant Tests ===\n');

// INVARIANT 1: A dominated lineage cannot be preferred over its dominator
async function testParetoDominance() {
  console.log('Test 1: Pareto dominance invariant');
  const pop = new math.MathematicalPopulation({ budget: { tokens: 1000 } });
  const l1 = math.createResearchLineage({ name: 'dominant' });
  const l2 = math.createResearchLineage({ name: 'dominated' });
  const l3 = math.createResearchLineage({ name: 'middle' });

  pop.addLineage(l1);
  pop.addLineage(l2);
  pop.addLineage(l3);

  // l1 dominates l2 in all dimensions
  pop.evaluateFitness(l1, { verifiedObligations: 9, totalObligations: 10, novelty: 0.9, informationGain: 0.9, affordancesCreated: 5, transferability: 0.9, resistanceToFalsification: 0.9, cost: 100 });
  pop.evaluateFitness(l2, { verifiedObligations: 2, totalObligations: 10, novelty: 0.2, informationGain: 0.2, affordancesCreated: 1, transferability: 0.2, resistanceToFalsification: 0.2, cost: 900 });
  pop.evaluateFitness(l3, { verifiedObligations: 8, totalObligations: 10, novelty: 0.7, informationGain: 0.7, affordancesCreated: 4, transferability: 0.7, resistanceToFalsification: 0.7, cost: 200 });

  const selected = pop.selectTop(2);
  const selectedIds = selected.map(l => l.id);

  // Dominated lineage (l2) must NOT be in top 2
  assert.ok(!selectedIds.includes(l2.id), 'INVARIANT VIOLATION: Dominated lineage selected over dominator');

  // Best lineage should be first
  assert.strictEqual(selected[0].id, l1.id, 'Best lineage should be first');

  console.log('  ✓ Pareto dominance invariant holds\n');
}

// INVARIANT 2: Fake SHA-256 can never produce verified artifact
async function testFakeReceiptRejection() {
  console.log('Test 2: Fake receipt rejection');
  const art = math.createProofArtifact({ type: 'lemma', statement: 'test' });

  // Try to create a FormalResult with fake SHA-256
  try {
    const fakeResult = createFormalResult({
      canonicalStatement: 'fake',
      status: 'verified',
      evidence: { kind: 'proof', content: 'fake' },
      assumptions: [],
      validityDomain: { statement: 'x', constraints: [] },
      dependencies: [],
      provenance: {
        createdAt: new Date().toISOString(),
        actor: 'test',
        source: { type: 'test', uri: 'test', digest: 'sha256:test' }, // INVALID
        inputs: [],
        transformations: [],
      },
      producer: { model: 'test', version: '1.0' },
    });
    assert.fail('Should have thrown for invalid SHA-256');
  } catch (e) {
    assert.ok(e.message.includes('SHA-256') || e.message.includes('fingerprint'));
  }

  // Try to attach verified FormalResult with invalid source digest
  const invalidResult = createFormalResult({
    canonicalStatement: 'fake',
    status: 'verified',
    evidence: { kind: 'proof', content: 'fake' },
    assumptions: [],
    validityDomain: { statement: 'x', constraints: [] },
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(),
      actor: 'test',
      source: { type: 'test', uri: 'test', digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' },
      inputs: [],
      transformations: [],
    },
    producer: { model: 'test', version: '1.0' },
  });

  try {
    art.attachFormalResult(invalidResult);
    assert.fail('Should have thrown for invalid source digest');
  } catch (e) {
    assert.ok(e.message.includes('SHA-256') || e.message.includes('source digest'));
  }

  console.log('  ✓ Fake receipt rejection works\n');
}

// INVARIANT 3: Child mutation never modifies parent
async function testLineageIsolation() {
  console.log('Test 3: Lineage isolation under mutation');
  const parent = math.createResearchLineage({
    name: 'parent',
    strategies: ['induction', 'contradiction'],
  });

  const child = parent.fork({ strategies: ['induction', 'omega'] });

  // Mutate child genome
  child.genome.strategies.push('ring');
  child.genome.representationOperators.push('SAT');
  child.phenotype.activeTools.push('sat-solver');
  child.phenotype.currentRepresentation = 'SAT';

  // Parent must be unchanged
  assert.ok(!parent.genome.strategies.includes('ring'), 'Parent genome.strategies modified by child!');
  assert.ok(!parent.genome.representationOperators.includes('SAT'), 'Parent genome.representationOperators modified!');
  assert.ok(!parent.phenotype.activeTools.includes('sat-solver'), 'Parent phenotype.activeTools modified!');
  assert.strictEqual(parent.phenotype.currentRepresentation, 'standard', 'Parent phenotype.currentRepresentation modified!');

  // Deep nested mutation
  const parent2 = math.createResearchLineage({ name: 'parent2', strategies: ['rewrite'] });
  const child2 = parent2.fork();
  child2.genome.researchPolicy.explorationRate = 0.9;
  assert.notStrictEqual(parent2.genome.researchPolicy.explorationRate, 0.9, 'Parent researchPolicy modified!');

  console.log('  ✓ Lineage isolation holds under mutation\n');
}

// INVARIANT 4: Unverified lemma cannot traverse HGT as established fact
async function testHGTUnverifiedBlocked() {
  console.log('Test 4: HGT blocks unverified lemmas');
  const engine = new math.MutationEngine({ hgtRate: 1.0 });

  const source = math.createResearchLineage({ name: 'source', strategies: ['unverified_lemma'] });
  source.fitness = { P: 0.05, N: 0.5, I: 0.5, A: 0, T: 0.5, R: 0.5, C: 1 }; // Low P = unverified

  const target = math.createResearchLineage({ name: 'target', strategies: ['induction'] });

  const result = engine.horizontalGeneTransfer(source, target, { blocked: false });

  // Should be blocked by AEIS gate due to insufficient verification
  assert.ok(result !== null, 'HGT should return result object');
  assert.strictEqual(result.immunePassed, false, 'Unverified lemma should be blocked by AEIS');
  assert.ok(result.blockReason === 'insufficient_source_verification' || result.blockReason === 'lemma_requires_proof_receipt');

  console.log('  ✓ HGT blocks unverified lemmas\n');
}

// INVARIANT 5: Migration leaves single canonical location
async function testMigrationSingleSource() {
  console.log('Test 5: Migration maintains single source of truth');
  const pop1 = new math.MathematicalPopulation({ id: 'pop1', budget: { tokens: 1000 } });
  const pop2 = new math.MathematicalPopulation({ id: 'pop2', budget: { tokens: 1000 } });

  const lineage = math.createResearchLineage({ name: 'migrant' });
  pop1.addLineage(lineage);

  // Verify initial state
  assert.ok(pop1.lineages.has(lineage.id), 'Lineage in source population');
  assert.ok(!pop2.lineages.has(lineage.id), 'Lineage not in target population');

  // Migrate
  pop1.migrateLineage(lineage.id, pop2);

  // Verify final state - only in target
  assert.ok(!pop1.lineages.has(lineage.id), 'Lineage removed from source population');
  assert.ok(pop2.lineages.has(lineage.id), 'Lineage added to target population');

  console.log('  ✓ Migration maintains single source of truth\n');
}

// INVARIANT 6: MVT departs only on real marginal yield
async function testMVTRealMarginal() {
  console.log('Test 6: MVT uses real marginal yield');
  const niche = math.createMathematicalNiche({ name: 'test', representation: 'SAT' });

  // Record some returns
  niche.recordReturn(1.0, 1); // yield = 1.0
  niche.recordReturn(0.8, 1); // yield = 0.8
  niche.recordReturn(0.6, 1); // yield = 0.6

  // Average marginal = (1.0 + 0.8 + 0.6) / 3 = 0.8
  const mvt = niche.evaluateMVT(0.5); // env threshold = 0.5
  assert.strictEqual(mvt.shouldDepart, false, 'Should not depart when marginal (0.8) > threshold (0.5)');
  assert.ok(Math.abs(mvt.marginalYield - 0.8) < 0.01, 'Marginal yield should be ~0.8');

  // Now add low returns
  niche.recordReturn(0.1, 1);
  niche.recordReturn(0.1, 1);
  niche.recordReturn(0.1, 1);

  // Recent 3: 0.1, 0.1, 0.1 -> avg = 0.1
  const mvt2 = niche.evaluateMVT(0.5);
  assert.strictEqual(mvt2.shouldDepart, true, 'Should depart when marginal (0.1) < threshold (0.5)');

  console.log('  ✓ MVT uses real marginal yield\n');
}

// INVARIANT 7: Useless question doesn't create niche
async function testQuestionValue() {
  console.log('Test 7: Question value computation');
  const engine = new math.QuestionogenesisEngine();

  const anomaly = engine.observeAnomaly({
    type: 'unexpected_invariant',
    description: 'test anomaly',
    confidence: 0.9,
  });

  // Generate question with low value context
  const lowValueQuestion = engine.generateQuestion(anomaly, {
    domain: 'test',
    createNiche: true,
    novelty: 0.1,
    testability: 0.1,
    expectedInfoGain: 0.1,
    futureAffordances: 0.1,
  });

  assert.ok(lowValueQuestion.value);
  assert.ok(lowValueQuestion.value.total < 0.1, 'Low value question should have low total value');

  // Generate question with high value context
  const highValueQuestion = engine.generateQuestion(anomaly, {
    domain: 'test',
    createNiche: true,
    novelty: 0.9,
    testability: 0.9,
    expectedInfoGain: 0.9,
    futureAffordances: 0.9,
  });

  assert.ok(highValueQuestion.value);
  assert.ok(highValueQuestion.value.total > 0.4, 'High value question should have high total value');

  console.log('  ✓ Question value properly computed\n');
}

// INVARIANT 8: Lean placeholders rejected
async function testLeanPlaceholders() {
  console.log('Test 8: Lean placeholders rejected');
  const graph = new MathematicalDependencyGraph();
  graph.addNode({
    nodeId: 'test-lemma',
    type: 'lemma',
    canonicalStatement: 'forall n : Nat, n >= 0',
    status: 'formalized',
  });

  const gate = new LeanIncrementalGate({
    graph,
    executor: async () => ({ exitCode: 0, toolchainVersion: 'lean-4.9.0', sourceDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000', axioms: [] }),
    toolchainVersion: 'lean-4.9.0',
    environmentDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  });

  // sorry should be rejected
  const error = gate.validateRequest({
    nodeId: 'test-lemma',
    source: 'begin sorry end',
  });
  assert.ok(error !== null, 'sorry must be rejected');

  // admit should be rejected
  const error2 = gate.validateRequest({
    nodeId: 'test-lemma',
    source: 'begin admit end',
  });
  assert.ok(error2 !== null, 'admit must be rejected');

  // sorry in middle should be rejected
  const error3 = gate.validateRequest({
    nodeId: 'test-lemma',
    source: 'have h : True := by sorry; exact h',
  });
  assert.ok(error3 !== null, 'sorry in middle must be rejected');

  console.log('  ✓ Lean placeholders rejected\n');
}

// INVARIANT 9: Verified lemmas go to knowledge, not strategies
async function testCultureKnowledgeSeparation() {
  console.log('Test 9: Culture verified/unverified separation');
  const culture = new math.MathematicalCulture({ fidelityRate: 0.9 });
  const target = math.createResearchLineage({ name: 'target' });

  // Verified lemma -> knowledge
  const lemma = culture.addArtifact({ type: 'lemma', content: 'important_lemma', verified: true });
  culture.transmit(lemma.id, target);
  assert.ok(target._knowledge && target._knowledge.length === 1, 'Verified lemma should be in knowledge');
  assert.ok(!target.genome.strategies.includes('important_lemma'), 'Verified lemma should NOT be in strategies');

  // Unverified heuristic -> strategies
  const heuristic = culture.addArtifact({ type: 'heuristic', content: 'try_this', verified: false });
  culture.transmit(heuristic.id, target);
  assert.ok(target.genome.strategies.includes('try_this'), 'Unverified heuristic should be in strategies');
  assert.ok(!target._knowledge?.some(k => k.content === 'try_this'), 'Unverified heuristic should NOT be in knowledge');

  console.log('  ✓ Culture separation holds\n');
}

// INVARIANT 10: FormalResult integrity - semantic fingerprint matches
async function testFormalResultIntegrity() {
  console.log('Test 10: FormalResult integrity');
  const result = createFormalResult({
    canonicalStatement: 'Test theorem',
    status: 'formalized',
    evidence: { kind: 'proof', content: 'proof' },
    assumptions: [],
    validityDomain: { statement: 'general', constraints: [] },
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(),
      actor: 'test',
      source: { type: 'test', uri: 'test', digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' },
      inputs: [],
      transformations: [],
    },
    producer: { model: 'test', version: '1.0' },
  });

  // Encode and decode
  const { encodeFormalResult, decodeFormalResult } = require('../src/services/formalResultService');
  const encoded = encodeFormalResult({
    canonicalStatement: 'Test theorem',
    status: 'formalized',
    evidence: { kind: 'proof', content: 'proof' },
    assumptions: [],
    validityDomain: { statement: 'general', constraints: [] },
    dependencies: [],
    provenance: {
      createdAt: new Date().toISOString(),
      actor: 'test',
      source: { type: 'test', uri: 'test', digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' },
      inputs: [],
      transformations: [],
    },
    producer: { model: 'test', version: '1.0' },
  });

  const decoded = decodeFormalResult(encoded);
  assert.strictEqual(decoded.resultId, result.resultId, 'Result ID must match after round-trip');
  assert.strictEqual(decoded.semanticFingerprint, result.semanticFingerprint, 'Semantic fingerprint must match');
  assert.strictEqual(decoded.evidence.digest, result.evidence.digest, 'Evidence digest must match');

  // Tamper with encoded data should fail
  const tampered = Buffer.from(encoded);
  tampered[tampered.length - 1] ^= 0xFF; // Flip last byte
  try {
    decodeFormalResult(tampered);
    assert.fail('Tampered data should fail to decode');
  } catch (e) {
    assert.ok(e.message.includes('mismatch') || e.message.includes('Invalid'));
  }

  console.log('  ✓ FormalResult integrity holds\n');
}

// Run all tests
async function runAllTests() {
  try {
    await testParetoDominance();
    await testFakeReceiptRejection();
    await testLineageIsolation();
    await testHGTUnverifiedBlocked();
    await testMigrationSingleSource();
    await testMVTRealMarginal();
    await testQuestionValue();
    await testLeanPlaceholders();
    await testCultureKnowledgeSeparation();
    await testFormalResultIntegrity();

    console.log('=== ALL ADVERSARIAL INVARIANT TESTS PASSED ===');
  } catch (e) {
    console.error('=== TEST FAILED ===', e);
    process.exit(1);
  }
}

runAllTests();