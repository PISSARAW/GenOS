const assert = require('node:assert/strict');
const {
  QuantumSuperposition
} = require('../src/services/quantumVfs/superpositionEngine');

async function testQuantumSuperpositionEngine() {
  console.log('--- 1. Testing Superposition Initialization & Normalization ---');
  const baseCode = `function processData(items) { return items.map(x => x * 2); }`;
  const superposition = new QuantumSuperposition(baseCode, 'src/dataProcessor.js');

  const distributionInitial = superposition.getStateDistribution();
  assert.equal(distributionInitial.length, 1);
  assert.equal(distributionInitial[0].probability, 1.0, 'Ground state probability must initially be 1.0');

  // Ajout de 2 hypothèses alternatives d'implémentation
  superposition.addEigenstate('hypothesis_iterative', `function processData(items) {
    const res = [];
    for (let i = 0; i < items.length; i++) res.push(items[i] * 2);
    return res;
  }`, 1.0);

  superposition.addEigenstate('hypothesis_stream', `function processData(items) {
    return Array.from(items, x => x * 2);
  }`, 1.0);

  const distributionThree = superposition.getStateDistribution();
  assert.equal(distributionThree.length, 3);
  const totalProb = distributionThree.reduce((sum, s) => sum + s.probability, 0.0);
  assert.ok(Math.abs(totalProb - 1.0) < 0.01, 'Sum of probabilities must equal 1.0 (|alpha|^2)');
  console.log('  ✅ PASS: 3 speculative eigenstates superposed with normalized probability amplitudes.');

  console.log('--- 2. Testing Parallel Speculative Evaluation ---');
  // Évaluateur simulant des critères d'efficience et d'optimisation
  await superposition.evaluateSuperposition(async (content, state) => {
    if (state.label === 'hypothesis_stream') return 0.95; // Solution la plus rapide et concise
    if (state.label === 'hypothesis_iterative') return 0.70;
    return 0.50; // Ground state standard
  });

  const evaluatedDistribution = superposition.getStateDistribution();
  const streamState = evaluatedDistribution.find(s => s.label === 'hypothesis_stream');
  assert.ok(streamState.probability > 0.40, 'Stream hypothesis must have the highest probability');
  console.log(`  ✅ PASS: Speculative evaluation complete. Leading state probability: ${streamState.probability}`);

  console.log('--- 3. Testing Wave Function Collapse to Winning State ---');
  const collapsed = superposition.collapse('highest_probability');
  assert.equal(collapsed.label, 'hypothesis_stream');
  assert.ok(collapsed.content.includes('Array.from'));
  assert.equal(superposition.isCollapsed, true);

  // Vérifier qu'on ne peut plus ajouter d'états après effondrement
  assert.throws(() => {
    superposition.addEigenstate('impossible_post_collapse', 'console.log(1);');
  }, /effondrement classique/);

  console.log('  ✅ PASS: Wave function collapsed decisively into the optimal eigenstate.');
}

(async () => {
  try {
    await testQuantumSuperpositionEngine();
    console.log('\n=============================================');
    console.log('QUANTUM VFS #3 (SUPERPOSITION) TESTS PASSED');
    console.log('=============================================');
  } catch (err) {
    console.error('Test failure:', err);
    process.exit(1);
  }
})();
