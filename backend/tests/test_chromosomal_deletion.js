const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING CHROMOSOMAL DELETION ===');

  // 1. Check initial status
  const initRes = await executeBioTool('genos_biomimicry_chromosomal_deletion', {
    action: 'status',
    id: 'chrom-test-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.deleted_segments_count, 0);
  console.log('✅ PASS: Initial chromosome has all 5 segments active');

  // 2. Delete non-essential legacy parser segment
  const delRes = await executeBioTool('genos_biomimicry_chromosomal_deletion', {
    action: 'delete_chromosome_segment',
    id: 'chrom-test-1',
    target_locus: 'LOCUS_LEGACY_PARSER'
  });
  assert.strictEqual(delRes.success, true);
  assert.strictEqual(delRes.is_viable, true);
  assert.strictEqual(delRes.pruned_kb, 450);
  console.log('✅ PASS: Deleted non-essential segment, saved 450 KB, pipeline remains viable');

  // 3. Delete experimental fuzzer
  await executeBioTool('genos_biomimicry_chromosomal_deletion', {
    action: 'delete_chromosome_segment',
    id: 'chrom-test-1',
    target_locus: 'LOCUS_EXPERIMENTAL_FUZZER'
  });

  // 4. Verify pipeline viability
  const viabilityRes = await executeBioTool('genos_biomimicry_chromosomal_deletion', {
    action: 'verify_pipeline_viability',
    id: 'chrom-test-1'
  });
  assert.strictEqual(viabilityRes.success, true);
  assert.strictEqual(viabilityRes.is_viable, true);
  assert.strictEqual(viabilityRes.active_segments_count, 3);
  assert.strictEqual(viabilityRes.pruned_footprint_kb, 760);
  console.log('✅ PASS: Pipeline viability verified with 760 KB total memory reduction');

  console.log('🎉 ALL CHROMOSOMAL DELETION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
