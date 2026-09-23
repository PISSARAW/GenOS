'use strict';

/**
 * test_mutation_engine_ablation.js
 *
 * Test d'ablation strict pour les 4 mécanismes de MutationEngine :
 *   - mutationRate=0      → aucune mutation (test avec Math.random mocké à 0)
 *   - recombinationRate=0 → aucun enfant
 *   - hgtRate=0           → aucun transfert
 *   - exaptationRate=0    → aucune exaptation
 *
 * Et les compteurs d'ablation doivent être incrémentés correctement.
 */

const assert = require('node:assert');
const { MutationEngine } = require('../src/services/mathematical/mutationEngine');

function createTestLineage(name = 'test') {
  return {
    id: name,
    name,
    genome: {
      strategies: ['induction', 'contradiction'],
      representationOperators: ['lean'],
      researchPolicy: { explorationRate: 0.5, exploitationThreshold: 0.8, mutationRate: 0.1 },
    },
    generation: 1,
    fitness: { P: 0.8 },
    _assimilatedPlasmids: [],
    _knowledge: [],
  };
}

// Sauvegarde du Math.random original
const originalRandom = Math.random;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    throw err;
  }
}

// Test 1: mutationRate=0, Math.random mocké à 0 → aucune mutation
test('mutationRate=0 avec Math.random()=0 → aucune mutation', () => {
  const engine = new MutationEngine({ mutationRate: 0, recombinationRate: 0, hgtRate: 0, exaptationRate: 0 });
  const lineage = createTestLineage('m0');
  Math.random = () => 0;
  for (let i = 0; i < 100; i++) {
    const result = engine.pointMutate(lineage);
    assert.strictEqual(result, null, 'Aucune mutation ne doit se produire avec rate=0');
  }
  assert.strictEqual(engine.pointMutations, 0);
  Math.random = originalRandom;
});

// Test 2: recombinationRate=0 → aucun enfant
test('recombinationRate=0 → aucun enfant', () => {
  const engine = new MutationEngine({ mutationRate: 0, recombinationRate: 0, hgtRate: 0, exaptationRate: 0 });
  const p1 = createTestLineage('p1');
  const p2 = createTestLineage('p2');
  Math.random = () => 0;
  for (let i = 0; i < 100; i++) {
    const result = engine.recombine(p1, p2);
    assert.strictEqual(result, null);
  }
  assert.strictEqual(engine.recombinations, 0);
  Math.random = originalRandom;
});

// Test 3: hgtRate=0 → aucun transfert
test('hgtRate=0 → aucun transfert', () => {
  const engine = new MutationEngine({ mutationRate: 0, recombinationRate: 0, hgtRate: 0, exaptationRate: 0 });
  const source = createTestLineage('src');
  const target = createTestLineage('tgt');
  const artifact = { isVerified: () => true, statement: 'test' };
  Math.random = () => 0;
  for (let i = 0; i < 100; i++) {
    const result = engine.horizontalGeneTransfer(source, target, artifact, null);
    assert.strictEqual(result, null);
  }
  assert.strictEqual(engine.hgtAttempts, 0);
  Math.random = originalRandom;
});

// Test 4: exaptationRate=0 → aucune exaptation
test('exaptationRate=0 → aucune exaptation', () => {
  const engine = new MutationEngine({ mutationRate: 0, recombinationRate: 0, hgtRate: 0, exaptationRate: 0 });
  const lineage = createTestLineage('e0');
  Math.random = () => 0;
  for (let i = 0; i < 100; i++) {
    const result = engine.exapt(lineage, 'ctx');
    assert.strictEqual(result, null);
  }
  assert.strictEqual(engine.exaptations, 0);
  Math.random = originalRandom;
});

// Test 5: rate=1, Math.random()=0.999 → toujours
test('mutationRate=1 avec Math.random()=0.999 → toujours', () => {
  const engine = new MutationEngine({ mutationRate: 1, recombinationRate: 1, hgtRate: 1, exaptationRate: 1 });
  const lineage = createTestLineage('m1');
  Math.random = () => 0.999;
  let count = 0;
  for (let i = 0; i < 10; i++) {
    if (engine.pointMutate(lineage)) count++;
  }
  assert.strictEqual(count, 10, 'Toutes les mutations doivent se produire avec rate=1');
  assert.strictEqual(engine.pointMutations, 10);
  Math.random = originalRandom;
});

// Test 6: rate=0.5, Math.random()=0.4 → exécute
test('mutationRate=0.5 avec Math.random()=0.4 → exécute', () => {
  const engine = new MutationEngine({ mutationRate: 0.5 });
  const lineage = createTestLineage('half');
  Math.random = () => 0.4;
  const result = engine.pointMutate(lineage);
  assert.ok(result, 'La mutation doit se produire');
  assert.strictEqual(engine.pointMutations, 1);
  Math.random = originalRandom;
});

// Test 7: rate=0.5, Math.random()=0.5 → NON (boundary)
test('mutationRate=0.5 avec Math.random()=0.5 → ne pas exécuter (boundary)', () => {
  const engine = new MutationEngine({ mutationRate: 0.5 });
  const lineage = createTestLineage('boundary');
  Math.random = () => 0.5;
  const result = engine.pointMutate(lineage);
  assert.strictEqual(result, null, 'rate=0.5 avec random=0.5 doit ne pas exécuter (>=)');
  assert.strictEqual(engine.pointMutations, 0);
  Math.random = originalRandom;
});

// Test 8: summary() expose tous les compteurs d'ablation
test('summary() expose tous les compteurs', () => {
  const engine = new MutationEngine({ mutationRate: 1, recombinationRate: 0, hgtRate: 0, exaptationRate: 1 });
  const lineage = createTestLineage('sum');
  Math.random = () => 0.999;
  engine.pointMutate(lineage);
  engine.exapt(lineage, 'ctx');
  const s = engine.summary();
  assert.strictEqual(s.pointMutations, 1);
  assert.strictEqual(s.exaptations, 1);
  assert.strictEqual(s.recombinations, 0);
  assert.strictEqual(s.hgtAttempts, 0);
  assert.strictEqual(s.hgtAssimilations, 0);
  assert.strictEqual(s.hgtRejections, 0);
  Math.random = originalRandom;
});

// Test 9: rate=1, Math.random()=0.999999 → toujours (boundary haute)
test('Tous les mécanismes rate=1 avec Math.random()=0.999999 → toujours', () => {
  const engine = new MutationEngine({ mutationRate: 1, recombinationRate: 1, hgtRate: 1, exaptationRate: 1 });
  
  Math.random = () => 0.999999;
  
  let counts = { point: 0, recombine: 0, exapt: 0, hgt: 0 };
  for (let i = 0; i < 10; i++) {
    const lineage = createTestLineage(`pt${i}`);
    const p1 = createTestLineage(`p1_${i}`);
    const p2 = createTestLineage(`p2_${i}`);
    const source = createTestLineage(`src${i}`);
    const target = createTestLineage(`tgt${i}`);
    const artifact = { isVerified: () => true, statement: `test${i}` };
    
    if (engine.pointMutate(lineage)) counts.point++;
    if (engine.recombine(p1, p2)) counts.recombine++;
    if (engine.exapt(lineage, 'ctx')) counts.exapt++;
    const hgtResult = engine.horizontalGeneTransfer(source, target, artifact, null);
    if (hgtResult && hgtResult.immunePassed) counts.hgt++;
  }
  
  assert.strictEqual(counts.point, 10, 'Toutes les mutations doivent se produire');
  assert.strictEqual(counts.recombine, 10, 'Toutes les recombinaisons doivent se produire');
  assert.strictEqual(counts.exapt, 10, 'Toutes les exaptations doivent se produire');
  assert.strictEqual(counts.hgt, 10, 'Tous les HGT doivent être assimilés');
  assert.strictEqual(engine.pointMutations, 10);
  assert.strictEqual(engine.recombinations, 10);
  assert.strictEqual(engine.exaptations, 10);
  assert.strictEqual(engine.hgtAttempts, 10);
  assert.strictEqual(engine.hgtAssimilations, 10);
  assert.strictEqual(engine.hgtRejections, 0);
  
  Math.random = originalRandom;
});
