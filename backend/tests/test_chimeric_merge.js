const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING CHIMERIC TETRAGAMETIC MERGE & MOSAIC HERITAGE ===');

  // 1. Fuse dual-embryo lineages into a single mosaic agent
  const fuseRes = await executeBioTool('genos_biomimicry_chimeric_merge', {
    action: 'fuse_mosaic',
    mosaic_id: 'mosaic-agent-chimeric-01',
    branch_genome: 'branch-tools-refactor-A',
    branch_epigenome: 'branch-memory-antifragile-B',
    tools: ['tool_ast_visitor', 'tool_bisection_engine', 'tool_crypto_prover'],
    vaccines: ['vaccine_null_pointer_guard', 'vaccine_infinite_recursion_breaker'],
    reasoning_strategy: 'MONTE_CARLO_TREE_SEARCH'
  });

  assert.strictEqual(fuseRes.success, true);
  assert.strictEqual(fuseRes.status, 'mosaic_fused');
  assert.strictEqual(fuseRes.functional_tools_count, 3);
  assert.strictEqual(fuseRes.immune_vaccines_count, 2);
  assert.ok(fuseRes.hybrid_dna_hash);
  console.log(`✅ PASS: Fused mosaic agent: DNA Hash ${fuseRes.hybrid_dna_hash.slice(0, 12)} (Coherence: ${fuseRes.coherence_score})`);

  // 2. Inspect dual-lineage tetragametic heritage
  const inspectRes = await executeBioTool('genos_biomimicry_chimeric_merge', {
    action: 'inspect_mosaic_heritage',
    mosaic_id: 'mosaic-agent-chimeric-01'
  });

  assert.strictEqual(inspectRes.success, true);
  assert.strictEqual(inspectRes.lineages.functional_genome_origin, 'branch-tools-refactor-A');
  assert.strictEqual(inspectRes.lineages.epigenetic_origin, 'branch-memory-antifragile-B');
  console.log('✅ PASS: Inspected mosaic heritage: Dual DNA/Epigenome verified');

  // 3. Verify structural and epigenetic mosaic coherence
  const verifyRes = await executeBioTool('genos_biomimicry_chimeric_merge', {
    action: 'verify_mosaic_coherence',
    mosaic_id: 'mosaic-agent-chimeric-01'
  });

  assert.strictEqual(verifyRes.success, true);
  assert.strictEqual(verifyRes.status, 'coherence_verified');
  assert.strictEqual(verifyRes.validation_passed, true);
  console.log(`✅ PASS: Mosaic coherence verified (Score: ${verifyRes.coherence_score})`);

  console.log('🎉 ALL CHIMERIC MERGE TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
