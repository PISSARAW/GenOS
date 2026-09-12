const assert = require('node:assert/strict');
const {
  HeisenbergGuard,
  HeisenbergRegime,
  HBAR_OVER_TWO
} = require('../src/services/quantumVfs/heisenbergGuard');

async function testHeisenbergUncertaintyGuard() {
  console.log('--- 1. Testing Uncertainty Relation Preservation ---');
  const guard = new HeisenbergGuard({ hBar: 1.0 });

  const initialStatus = guard.calibrateObservability();
  assert.ok(initialStatus.uncertaintyProduct >= HBAR_OVER_TWO - 0.001, 'Product Delta_x * Delta_p must be >= hbar / 2');
  console.log(`  ✅ PASS: Uncertainty bound preserved (Δx * Δp = ${initialStatus.uncertaintyProduct} >= 0.5).`);

  console.log('--- 2. Testing High-Velocity Generation Regime ---');
  // Rafale d'actions à haute énergie (génération massive de code)
  for (let i = 0; i < 10; i++) {
    guard.recordPulse(3.5);
  }

  const fastStatus = guard.calibrateObservability();
  assert.equal(fastStatus.regime, HeisenbergRegime.HIGH_VELOCITY);
  assert.equal(fastStatus.auditLevel, 'shallow');
  assert.ok(fastStatus.deltaP >= 2.0, 'Momentum must reflect high velocity');
  assert.ok(fastStatus.deltaX <= 0.25, 'Spatial audit overhead reduced to minimize friction');

  console.log(`  ✅ PASS: High-velocity regime active. Micro-audit paused for maximal throughput (p = ${fastStatus.momentum}).`);

  console.log('--- 3. Testing Resting Freeze for Gate Certification ---');
  const freezeReport = guard.freezeForMeasurement('PRE_COMMIT_AUDIT');
  assert.equal(freezeReport.frozen, true);
  assert.equal(freezeReport.regime, HeisenbergRegime.MAX_OBSERVABILITY);
  assert.equal(freezeReport.auditLevel, 'deep');
  assert.equal(freezeReport.certifiedPrecision, 'ABSOLUTE_ACCURACY');

  console.log('  ✅ PASS: Resting freeze successfully collapsed momentum to allow absolute precision measurement.');
}

(async () => {
  try {
    await testHeisenbergUncertaintyGuard();
    console.log('\n=============================================');
    console.log('QUANTUM VFS #5 (HEISENBERG) TESTS PASSED');
    console.log('=============================================');
  } catch (err) {
    console.error('Test failure:', err);
    process.exit(1);
  }
})();
