const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING DYNAMIC TRIPLET EXPANSIONS & ANTICIPATION ===');

  // 1. Initial status (Normal benign baseline)
  const initRes = await executeBioTool('genos_biomimicry_dynamic_triplet_expansion', {
    action: 'status',
    id: 'dyn-test-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.repeat_count, 15);
  assert.strictEqual(initRes.is_pathological, false);
  console.log('✅ PASS: Normal baseline state verified (15 repeats)');

  // 2. Generation 2 replication: slippage +15 (total 30 repeats, still pre-mutation)
  const gen2Res = await executeBioTool('genos_biomimicry_dynamic_triplet_expansion', {
    action: 'replicate_generation',
    id: 'dyn-test-1',
    delta_repeats: 15
  });
  assert.strictEqual(gen2Res.success, true);
  assert.strictEqual(gen2Res.generation, 2);
  assert.strictEqual(gen2Res.repeat_count, 30);
  assert.strictEqual(gen2Res.is_pathological, false);
  console.log('✅ PASS: Generation 2 expanded to 30 repeats');

  // 3. Generation 3 replication: slippage +20 (total 50 repeats >= 40 -> PATHOLOGICAL_EXPANDED)
  const gen3Res = await executeBioTool('genos_biomimicry_dynamic_triplet_expansion', {
    action: 'replicate_generation',
    id: 'dyn-test-1',
    delta_repeats: 20
  });
  assert.strictEqual(gen3Res.success, true);
  assert.strictEqual(gen3Res.generation, 3);
  assert.strictEqual(gen3Res.repeat_count, 50);
  assert.strictEqual(gen3Res.is_pathological, true);
  assert.strictEqual(gen3Res.severity, 'PATHOLOGICAL_EXPANDED');
  console.log('✅ PASS: Generation 3 crossed anticipation pathological threshold (50 repeats)');

  // 4. Generation 4 replication: slippage +25 (total 75 repeats >= 70 -> SEVERE_EARLY_ONSET)
  await executeBioTool('genos_biomimicry_dynamic_triplet_expansion', {
    action: 'replicate_generation',
    id: 'dyn-test-1',
    delta_repeats: 25
  });

  const evalRes = await executeBioTool('genos_biomimicry_dynamic_triplet_expansion', {
    action: 'evaluate_anticipation_risk',
    id: 'dyn-test-1'
  });
  assert.strictEqual(evalRes.success, true);
  assert.strictEqual(evalRes.repeat_count, 75);
  assert.strictEqual(evalRes.severity, 'SEVERE_EARLY_ONSET');
  assert.strictEqual(evalRes.circuit_breaker_advised, true);
  console.log('✅ PASS: Anticipation risk detected severe repeat runaway with circuit breaker advised');

  console.log('🎉 ALL DYNAMIC EXPANSION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
