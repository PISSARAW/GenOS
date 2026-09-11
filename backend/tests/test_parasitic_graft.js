const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING PARASITIC GRAFT & AUTOSITE LIMB INVOCATION ===');

  // 1. Graft an arrested/stalled twin onto the surviving autosite
  const graftRes = await executeBioTool('genos_biomimicry_parasitic_graft', {
    action: 'graft_arrested_twin',
    graft_id: 'graft-test-01',
    autosite_id: 'agent-autosite-main',
    arrested_twin_id: 'agent-twin-stalled-02',
    harvested_residual_tokens: 15000,
    limbs: [
      { limbName: 'aux_ast_analyzer', capability: 'ast_analysis', costRating: 0.1 },
      { limbName: 'fast_pattern_matcher', capability: 'regex_trie', costRating: 0.05 }
    ]
  });

  assert.strictEqual(graftRes.success, true);
  assert.strictEqual(graftRes.status, 'parasite_grafted');
  assert.strictEqual(graftRes.grafted_limbs_count, 2);
  assert.strictEqual(graftRes.harvested_tokens, 15000);
  console.log(`✅ PASS: Grafted arrested twin: 2 limbs assimilated, ${graftRes.harvested_tokens} tokens harvested`);

  // 2. Invoke a grafted parasitic limb from the autosite
  const invokeRes = await executeBioTool('genos_biomimicry_parasitic_graft', {
    action: 'invoke_parasitic_limb',
    graft_id: 'graft-test-01',
    limb_name: 'aux_ast_analyzer',
    payload: { targetNode: 'CallExpression' }
  });

  assert.strictEqual(invokeRes.success, true);
  assert.strictEqual(invokeRes.status, 'limb_invoked');
  assert.strictEqual(invokeRes.overhead_tokens_consumed, 5);
  console.log('✅ PASS: Invoked parasitic limb with ultra-low passive container overhead (5 tokens)');

  console.log('🎉 ALL PARASITIC GRAFT TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
