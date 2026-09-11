const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING GENOMIC ANEUPLOIDY ===');

  // 1. Initial diploid karyotype status
  const initRes = await executeBioTool('genos_biomimicry_aneuploidy', {
    action: 'status',
    id: 'aneu-test-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.karyotype.chrom_verifier, 2);
  console.log('✅ PASS: Initial diploid karyotype verified (2 copies of each chromosome)');

  // 2. Induce trisomy (+1 copy) on verification chromosome for 3-way consensus
  const triRes = await executeBioTool('genos_biomimicry_aneuploidy', {
    action: 'induce_trisomy',
    id: 'aneu-test-1',
    target_chromosome: 'chrom_verifier'
  });
  assert.strictEqual(triRes.success, true);
  assert.strictEqual(triRes.copy_count, 3);
  assert.strictEqual(triRes.karyotype.chrom_verifier, 3);
  console.log('✅ PASS: Induced trisomy (3 copies of chrom_verifier)');

  // 3. Resolve trisomic consensus
  const consRes = await executeBioTool('genos_biomimicry_aneuploidy', {
    action: 'resolve_aneuploid_consensus',
    id: 'aneu-test-1',
    votes: ['VALID_PROOF', 'VALID_PROOF', 'UNCERTAIN']
  });
  assert.strictEqual(consRes.success, true);
  assert.strictEqual(consRes.winner, 'VALID_PROOF');
  assert.strictEqual(consRes.supermajority_achieved, true);
  console.log('✅ PASS: Resolved trisomic 2/3 supermajority consensus');

  // 4. Induce monosomy (-1 copy) on executor for ultra-frugal mode
  const monoRes = await executeBioTool('genos_biomimicry_aneuploidy', {
    action: 'induce_monosomy',
    id: 'aneu-test-1',
    target_chromosome: 'chrom_executor'
  });
  assert.strictEqual(monoRes.success, true);
  assert.strictEqual(monoRes.copy_count, 1);
  assert.strictEqual(monoRes.karyotype.chrom_executor, 1);
  console.log('✅ PASS: Induced monosomy (1 copy of chrom_executor for frugal execution)');

  console.log('🎉 ALL ANEUPLOIDY TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
