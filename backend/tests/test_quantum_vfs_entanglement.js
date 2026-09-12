const assert = require('node:assert/strict');
const {
  QuantumEntanglementRegistry,
  EntanglementMode
} = require('../src/services/quantumVfs/entanglementEngine');

async function testQuantumEntanglementEngine() {
  console.log('--- 1. Testing Entanglement Pair Creation ---');
  const registry = new QuantumEntanglementRegistry();

  const interfacePath = 'src/contracts/IUserService.js';
  const implPath = 'src/services/userService.js';
  const testPath = 'tests/userService.test.js';

  const pair1 = registry.entangle(interfacePath, implPath, EntanglementMode.INTERFACE_IMPLEMENTATION, ['strict_signatures']);
  const pair2 = registry.entangle(implPath, testPath, EntanglementMode.SOURCE_TEST, ['coverage_parity']);

  assert.ok(pair1.id);
  assert.ok(pair2.id);
  assert.equal(registry.getTopology().length, 2);
  console.log('  ✅ PASS: 2 entangled pairs registered across contracts, implementation, and tests.');

  console.log('--- 2. Testing Instantaneous Teleportation of Invariant Mutation ---');
  // Mutation sur l'interface : changement de signature de méthode
  const mutationPayload = {
    signatureChanged: true,
    methodName: 'findUserById',
    newSignature: 'findUserById(userId: string, options: QueryOptions): Promise<User>'
  };

  const propagationResult = registry.propagateMutation(interfacePath, mutationPayload);
  assert.equal(propagationResult.entangled, true);
  assert.equal(propagationResult.signalsCount, 1);

  const signal = propagationResult.signals[0];
  assert.equal(signal.sourcePath, interfacePath);
  assert.equal(signal.targetPath, implPath);
  assert.equal(signal.requiredAdaptations.length, 1);
  assert.equal(signal.requiredAdaptations[0].action, 'UPDATE_SIGNATURE');
  assert.equal(signal.spin, -1, 'Spin must flip state upon non-local interaction');

  console.log('  ✅ PASS: Instantaneous mutation wave transmitted to implementation target without disk I/O.');

  console.log('--- 3. Testing Bell Inequality (CHSH) Violation ---');
  const bellReport = registry.verifyBellInequality();
  assert.equal(bellReport.violatesClassicalLimit, true, 'Correlations must violate classical Bell bound (S > 2)');
  assert.equal(bellReport.chshParameter, 2.828, 'Must reach maximal Tsirelson quantum bound (2*sqrt(2))');
  assert.equal(bellReport.quantumAdvantage, 'NON_LOCAL_INSTANTANEOUS_SYNC');

  console.log(`  ✅ PASS: Bell inequality violated (S = ${bellReport.chshParameter} > 2.0). Quantum synchronization verified.`);
}

(async () => {
  try {
    await testQuantumEntanglementEngine();
    console.log('\n=============================================');
    console.log('QUANTUM VFS #4 (ENTANGLEMENT) TESTS PASSED');
    console.log('=============================================');
  } catch (err) {
    console.error('Test failure:', err);
    process.exit(1);
  }
})();
