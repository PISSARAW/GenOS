const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING POINT MUTATION (SUBSTITUTION) ===');

  // 1. Silent substitution
  const silentRes = await executeBioTool('genos_biomimicry_point_mutation', {
    action: 'apply_substitution',
    id: 'mut-point-test-1',
    mutation_type: 'silent',
    target_key: 'variable_alias',
    replacement_value: 'synonymous_alias'
  });

  assert.strictEqual(silentRes.success, true);
  assert.strictEqual(silentRes.status, 'substitution_applied');
  assert.strictEqual(silentRes.execution_halted, false);
  assert.strictEqual(silentRes.divergence_score, 0.02);
  console.log('✅ PASS: Silent substitution preserved execution invariance');

  // 2. Missense substitution
  const missenseRes = await executeBioTool('genos_biomimicry_point_mutation', {
    action: 'apply_substitution',
    id: 'mut-point-test-1',
    mutation_type: 'missense',
    target_key: 'temperature_parameter',
    replacement_value: '0.85'
  });

  assert.strictEqual(missenseRes.success, true);
  assert.strictEqual(missenseRes.execution_halted, false);
  assert.strictEqual(missenseRes.divergence_score, 0.37);
  console.log('✅ PASS: Missense substitution adjusted behavioral parameter');

  // 3. Nonsense substitution (STOP codon circuit-breaker)
  const nonsenseRes = await executeBioTool('genos_biomimicry_point_mutation', {
    action: 'apply_substitution',
    id: 'mut-point-test-1',
    mutation_type: 'nonsense',
    target_key: 'pipeline_checkpoint',
    replacement_value: 'STOP_CIRCUIT_BREAKER'
  });

  assert.strictEqual(nonsenseRes.success, true);
  assert.strictEqual(nonsenseRes.execution_halted, true);
  assert.strictEqual(nonsenseRes.divergence_score, 1.0);
  console.log('✅ PASS: Nonsense substitution triggered early termination circuit-breaker');

  // 4. Evaluate impact
  const evalRes = await executeBioTool('genos_biomimicry_point_mutation', {
    action: 'evaluate_impact',
    id: 'mut-point-test-1'
  });

  assert.strictEqual(evalRes.success, true);
  assert.strictEqual(evalRes.active_halt, true);
  assert.strictEqual(evalRes.history.length, 3);
  console.log('✅ PASS: Point mutation history and halt status correctly evaluated');

  console.log('🎉 ALL POINT MUTATION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
