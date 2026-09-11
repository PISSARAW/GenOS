const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING CONJOINED TWIN BIND & VISCERAL RESOURCE COUPLING ===');

  // 1. Bind two core agents into conjoined siamese twins
  const bindRes = await executeBioTool('genos_biomimicry_conjoined_twin_bind', {
    action: 'bind_conjoined_twins',
    pair_id: 'pair-siamese-test',
    twin_a: 'agent-prover-A',
    twin_b: 'agent-verifier-B',
    shared_tokens: 60000,
    shared_organs: ['shared_token_pool', 'thalamic_sensory_bridge', 'atomic_io_lock']
  });

  assert.strictEqual(bindRes.success, true);
  assert.strictEqual(bindRes.status, 'twins_conjoined');
  assert.strictEqual(bindRes.shared_token_pool, 60000);
  assert.strictEqual(bindRes.vital_coupling_score, 0.98);
  console.log(`✅ PASS: Conjoined visceral bind active (Coupling: ${bindRes.vital_coupling_score}, Pool: ${bindRes.shared_token_pool})`);

  // 2. Transfuse shared tokens across the visceral bridge
  const transfuseRes = await executeBioTool('genos_biomimicry_conjoined_twin_bind', {
    action: 'transfuse_shared_resource',
    pair_id: 'pair-siamese-test',
    recipient: 'agent-verifier-B',
    amount: 5000
  });

  assert.strictEqual(transfuseRes.success, true);
  assert.strictEqual(transfuseRes.amount_transfused, 5000);
  assert.strictEqual(transfuseRes.remaining_shared_pool, 55000);
  console.log(`✅ PASS: Transfused 5000 tokens (Remaining pool: ${transfuseRes.remaining_shared_pool})`);

  // 3. Status check
  const statusRes = await executeBioTool('genos_biomimicry_conjoined_twin_bind', {
    action: 'status',
    pair_id: 'pair-siamese-test'
  });
  assert.strictEqual(statusRes.success, true);
  assert.strictEqual(statusRes.shared_pool, 55000);
  console.log('✅ PASS: Conjoined twin pair status verified');

  console.log('🎉 ALL CONJOINED TWIN TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
