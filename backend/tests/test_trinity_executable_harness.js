'use strict';

const { testControlledVariant, testHeterogeneousVariant, testAdversarialVariant, testCounterfactualVariant, testFactorialVariant } = require('./trinityHarness/coreVariants');
const { testParetoVariant, testJuryVariant, testRecursiveVariant, testAdaptiveVariant } = require('./trinityHarness/selectionVariants');
const { testTemporalVariant, testOracularVariant, testExploratoryVariant } = require('./trinityHarness/timeAndDiscovery');
const { testFactualMissions, testEvidenceGates, testBalanceVerifier, testClaimVerification, testVariantGating } = require('./trinityHarness/evidenceChecks');

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('GENOS TRINITY EXECUTABLE TEST HARNESS');
  console.log('Testing variant contracts with deterministic fixtures');
  console.log('='.repeat(60));

  const results = [];

  results.push(await testControlledVariant());
  results.push(await testHeterogeneousVariant());
  results.push(await testAdversarialVariant());
  results.push(await testCounterfactualVariant());
  results.push(await testFactorialVariant());
  results.push(await testParetoVariant());
  results.push(await testJuryVariant());
  results.push(await testRecursiveVariant());
  results.push(await testAdaptiveVariant());
  results.push(await testTemporalVariant());
  results.push(await testOracularVariant());
  results.push(await testExploratoryVariant());
  results.push(await testFactualMissions());
  results.push(await testEvidenceGates());
  results.push(await testBalanceVerifier());
  results.push(await testClaimVerification());
  results.push(await testVariantGating());

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success).length;
  const total = results.length;

  console.log(`Passed: ${passed}/${total}`);

  for (const r of results) {
    if (r.variant) {
      console.log(`  ${r.variant}: ${r.success ? '✓ PASS' : '✗ FAIL'}`);
    }
  }

  if (passed === total) {
    console.log('\n✅ ALL TESTS PASSED - Variant contract fixtures completed');
  } else {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
  }

  return results;
}

runAllTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  console.error(err.stack);
  process.exit(1);
});
