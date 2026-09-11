const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING CHROMOSOMAL DUPLICATION & NEOFUNCTIONALIZATION ===');

  // 1. Initial status
  const initRes = await executeBioTool('genos_biomimicry_chromosomal_duplication', {
    action: 'status',
    id: 'dup-test-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.total_segments, 1);
  console.log('✅ PASS: Initial single-copy segment verified');

  // 2. Duplicate reasoning engine in tandem
  const dupRes = await executeBioTool('genos_biomimicry_chromosomal_duplication', {
    action: 'duplicate_chromosome_segment',
    id: 'dup-test-1',
    target_locus: 'LOCUS_REASONING_ENGINE'
  });
  assert.strictEqual(dupRes.success, true);
  assert.strictEqual(dupRes.total_copies, 2);
  console.log('✅ PASS: Duplicated segment in tandem (2 copies active)');

  // 3. Diverge duplicated copy #2 (Neo-functionalization)
  const divergeRes = await executeBioTool('genos_biomimicry_chromosomal_duplication', {
    action: 'diverge_duplicated_branch',
    id: 'dup-test-1',
    target_locus: 'LOCUS_REASONING_ENGINE',
    copy_index: 2,
    new_heuristic: 'stochastic_monte_carlo'
  });
  assert.strictEqual(divergeRes.success, true);
  assert.strictEqual(divergeRes.segments[0].heuristic, 'strict_deductive');
  assert.strictEqual(divergeRes.segments[1].heuristic, 'stochastic_monte_carlo');
  assert.strictEqual(divergeRes.segments[1].isNeoFunctionalized, true);
  console.log('✅ PASS: Neo-functionalized copy #2 to Monte Carlo while copy #1 preserved deductive baseline');

  console.log('🎉 ALL CHROMOSOMAL DUPLICATION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
