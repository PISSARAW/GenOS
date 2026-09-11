const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING CHROMOSOMAL TRANSLOCATION ===');

  // 1. Initial status
  const initRes = await executeBioTool('genos_biomimicry_chromosomal_translocation', {
    action: 'status',
    target_agent_id: 'agent-target-1'
  });
  assert.strictEqual(initRes.success, true);
  console.log('✅ PASS: Initial agent chromosome status verified');

  // 2. Translocate formal prover locus from prover agent to researcher agent
  const transRes = await executeBioTool('genos_biomimicry_chromosomal_translocation', {
    action: 'translocate_segment',
    source_agent_id: 'agent-prover-src',
    target_agent_id: 'agent-researcher-dst',
    locus: 'LOCUS_COQ_FORMAL_PROVER'
  });
  assert.strictEqual(transRes.success, true);
  assert.strictEqual(transRes.translocated_locus, 'LOCUS_COQ_FORMAL_PROVER');
  assert.ok(transRes.target_loci.includes('LOCUS_COQ_FORMAL_PROVER'));
  console.log('✅ PASS: Translocated formal prover locus into researcher agent chromosome');

  // 3. Fuse heterologous chromosomes
  const fuseRes = await executeBioTool('genos_biomimicry_chromosomal_translocation', {
    action: 'fuse_heterologous_chromosomes',
    target_agent_id: 'agent-researcher-dst',
    hybrid_package: ['LOCUS_AST_MUTATOR', 'LOCUS_SECURITY_GUARD']
  });
  assert.strictEqual(fuseRes.success, true);
  assert.ok(fuseRes.total_loci.includes('LOCUS_AST_MUTATOR'));
  assert.ok(fuseRes.total_loci.includes('LOCUS_SECURITY_GUARD'));
  console.log(`✅ PASS: Fused heterologous package (total loci now: ${fuseRes.total_loci.length})`);

  console.log('🎉 ALL CHROMOSOMAL TRANSLOCATION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
