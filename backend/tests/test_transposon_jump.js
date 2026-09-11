const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING TRANSPOSONS (JUMPING GENES) ===');

  // 1. Initial status
  const initRes = await executeBioTool('genos_biomimicry_transposon_jump', {
    action: 'status',
    id: 'tn-test-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.transposons_count, 1);
  console.log('✅ PASS: Initial transposon state verified');

  // 2. Cut-and-paste jump into empty LOCUS_C
  const cutRes = await executeBioTool('genos_biomimicry_transposon_jump', {
    action: 'cut_and_paste_jump',
    id: 'tn-test-1',
    transposon_name: 'Tn_ALU_1',
    target_locus: 'LOCUS_C'
  });
  assert.strictEqual(cutRes.success, true);
  assert.strictEqual(cutRes.loci_state.LOCUS_C, 'TRANSPOSED_Tn_ALU_1');
  assert.strictEqual(cutRes.loci_state.LOCUS_B, 'EMPTY');
  console.log('✅ PASS: Cut-and-paste transposon relocated to LOCUS_C');

  // 3. Copy-and-paste retrotransposition into LOCUS_D (disrupts previous SECURITY_GATE)
  const copyRes = await executeBioTool('genos_biomimicry_transposon_jump', {
    action: 'copy_and_paste_retrojump',
    id: 'tn-test-1',
    transposon_name: 'Tn_ALU_1',
    target_locus: 'LOCUS_D'
  });
  assert.strictEqual(copyRes.success, true);
  assert.strictEqual(copyRes.total_transposons, 2);
  assert.strictEqual(copyRes.disrupted_loci.length, 1);
  assert.strictEqual(copyRes.disrupted_loci[0].disruptedContent, 'SECURITY_GATE');
  console.log('✅ PASS: Retrotransposition created second copy and recorded locus disruption');

  // 4. Inspect impact
  const impactRes = await executeBioTool('genos_biomimicry_transposon_jump', {
    action: 'inspect_insertion_impact',
    id: 'tn-test-1'
  });
  assert.strictEqual(impactRes.success, true);
  assert.strictEqual(impactRes.disrupted_count, 1);
  console.log('✅ PASS: Transposon insertion impact correctly inspected');

  console.log('🎉 ALL TRANSPOSON TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
