const assert = require('node:assert/strict');
const {
  decomposeIntoQuanta,
  applyQuantumTransition,
  AstQuantum,
  QuantumType,
  calculateActionPotential
} = require('../src/services/quantumVfs/quantumAst');

async function testQuantumAstDecompositionAndIntegrity() {
  console.log('--- 1. Testing Quantum AST Decomposition ---');

  const sourceCode = `const fs = require('fs');
const path = require('path');

function computeEnergy(frequency) {
  const h = 6.626e-34;
  return h * frequency;
}

class QuantumHarmonizer {
  constructor(name) {
    this.name = name;
  }
}

module.exports = { computeEnergy };`;

  const quanta = decomposeIntoQuanta(sourceCode);
  assert.ok(quanta.length >= 3, `Must decompose into at least 3 distinct quanta, got ${quanta.length}`);
  
  const funcQuantum = quanta.find(q => q.type === QuantumType.FUNCTION);
  assert.ok(funcQuantum, 'Must identify FUNCTION quantum');
  assert.ok(funcQuantum.content.includes('function computeEnergy'));
  assert.equal(funcQuantum.validate().valid, true, 'Function quantum must be structurally valid');

  const classQuantum = quanta.find(q => q.type === QuantumType.CLASS);
  assert.ok(classQuantum, 'Must identify CLASS quantum');
  assert.ok(classQuantum.content.includes('class QuantumHarmonizer'));

  console.log(`  ✅ PASS: Source code quantized into ${quanta.length} discrete AST quanta.`);

  console.log('--- 2. Testing Planck Action Potential Calculation ---');
  const actionPotential = calculateActionPotential(quanta);
  assert.ok(actionPotential > 0, 'Action potential S must be strictly positive');
  console.log(`  ✅ PASS: Planck Action Potential S = ${actionPotential.toFixed(2)} arbitrary units.`);

  console.log('--- 3. Testing Atomic Quantum Replacement ---');
  const replacementFunction = new AstQuantum({
    type: QuantumType.FUNCTION,
    content: `function computeEnergy(frequency) {\n  const h = 6.62607015e-34;\n  return (h * frequency) * 1.0;\n}`
  });

  const transitionResult = applyQuantumTransition(sourceCode, [
    { action: 'replace', targetHash: funcQuantum.hash, quantum: replacementFunction }
  ]);

  assert.equal(transitionResult.success, true);
  assert.ok(transitionResult.content.includes('6.62607015e-34'));
  assert.ok(!transitionResult.content.includes('6.626e-34'));
  console.log('  ✅ PASS: Atomic quantum transition executed cleanly without syntax disruption.');

  console.log('--- 4. Testing Planck Barrier Rejection on Broken Syntax ---');
  const brokenQuantum = new AstQuantum({
    type: QuantumType.FUNCTION,
    content: `function broken() { console.log('unclosed';` // Missing closing bracket
  });

  assert.throws(() => {
    applyQuantumTransition(sourceCode, [
      { action: 'insert', index: 1, quantum: brokenQuantum }
    ]);
  }, /Barrière de Planck violée/);

  console.log('  ✅ PASS: Malformed half-quanta rejected at Planck barrier, preserving file integrity.');
}

(async () => {
  try {
    await testQuantumAstDecompositionAndIntegrity();
    console.log('\n========================================');
    console.log('QUANTUM VFS #1 (AST QUANTA) TESTS PASSED');
    console.log('========================================');
  } catch (err) {
    console.error('Test failure:', err);
    process.exit(1);
  }
})();
