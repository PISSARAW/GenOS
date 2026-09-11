const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING CHROMOSOMAL INVERSION & BACKWARD CHAINING ===');

  // 1. Initial status
  const initRes = await executeBioTool('genos_biomimicry_chromosomal_inversion', {
    action: 'status',
    id: 'inv-test-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.is_inverted, false);
  console.log('✅ PASS: Initial forward sequence verified');

  // 2. Invert entire chromosome (0 to 3)
  const invRes = await executeBioTool('genos_biomimicry_chromosomal_inversion', {
    action: 'invert_chromosome_segment',
    id: 'inv-test-1',
    start_index: 0,
    end_index: 3
  });
  assert.strictEqual(invRes.success, true);
  assert.strictEqual(invRes.is_inverted, true);
  assert.strictEqual(invRes.segments[0], 'STEP_VALIDATE_POSTCOND');
  assert.strictEqual(invRes.segments[3], 'STEP_HYPOTHESIZE');
  console.log('✅ PASS: Segment inverted 180°: starts with post-condition validation');

  // 3. Execute backward reasoning chain
  const chainRes = await executeBioTool('genos_biomimicry_chromosomal_inversion', {
    action: 'execute_backward_chain',
    id: 'inv-test-1'
  });
  assert.strictEqual(chainRes.success, true);
  assert.strictEqual(chainRes.mode, 'retrograde_backward_reasoning');
  console.log('✅ PASS: Retrograde backward reasoning flow executed successfully');

  console.log('🎉 ALL CHROMOSOMAL INVERSION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
