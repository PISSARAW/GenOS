const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING HYBRID MULTIPLES MATRIX ===');

  // 1. Generate hybrid cluster: 2 families x 2 isogenic clones = 4 agents
  const genRes = await executeBioTool('genos_biomimicry_hybrid_multiples', {
    action: 'generate_hybrid_cluster',
    cluster_id: 'cluster-hybrid-test',
    archetypes: [
      { familyName: 'ProverFamily', model: 'claude-3-5-sonnet', clonesPerFamily: 2 },
      { familyName: 'ExplorerFamily', model: 'gpt-4o', clonesPerFamily: 2 }
    ]
  });

  assert.strictEqual(genRes.success, true);
  assert.strictEqual(genRes.status, 'hybrid_cluster_generated');
  assert.strictEqual(genRes.families_count, 2);
  assert.strictEqual(genRes.total_agents_count, 4);
  console.log(`✅ PASS: Generated hybrid cluster with ${genRes.total_agents_count} agents across ${genRes.families_count} families`);

  // 2. Evaluate cluster dispersion and coverage
  const evalRes = await executeBioTool('genos_biomimicry_hybrid_multiples', {
    action: 'evaluate_cluster_dispersion',
    cluster_id: 'cluster-hybrid-test'
  });

  assert.strictEqual(evalRes.success, true);
  assert.strictEqual(evalRes.status, 'dispersion_evaluated');
  assert.strictEqual(evalRes.dispersion_metrics.intraFamilyIsogenicStability, 1.0);
  console.log('✅ PASS: Dispersion and isogenic stability verified');

  console.log('🎉 ALL HYBRID MULTIPLES TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
