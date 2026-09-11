const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING MIRROR TWIN FORK & POLAR VALIDATION ===');

  // 1. Fork workspace into polar mirror twins
  const forkRes = await executeBioTool('genos_biomimicry_mirror_twin_fork', {
    action: 'fork_mirror_pair',
    pair_id: 'pair-auth-refactor',
    snapshot_id: 'snp-base-100',
    workspace_id: 'ws-core',
    mission: 'Implement Zero-Trust JWT verification module'
  });

  assert.strictEqual(forkRes.success, true);
  assert.strictEqual(forkRes.status, 'mirror_pair_forked');
  assert.strictEqual(forkRes.right_twin.polarity, 'constructive_optimist');
  assert.strictEqual(forkRes.left_twin.polarity, 'adversarial_skeptic_situs_inversus');
  console.log(`✅ PASS: Forked mirror twins: Right (${forkRes.right_twin.id}) vs Left (${forkRes.left_twin.id})`);

  // 2. Cross-evaluation of constructive claims vs adversarial counter-examples
  const evalRes = await executeBioTool('genos_biomimicry_mirror_twin_fork', {
    action: 'evaluate_polarity_equilibrium',
    pair_id: 'pair-auth-refactor',
    constructive_claims: [
      'Valid JWT signature accepted',
      'Expired token rejected with 401',
      'Role permissions verified'
    ],
    adversarial_critiques: [
      'Null algorithm header injection vulnerability test',
      'Clock skew tolerance boundary test'
    ]
  });

  assert.strictEqual(evalRes.success, true);
  assert.strictEqual(evalRes.status, 'equilibrium_evaluated');
  assert.ok(evalRes.equilibrium_score >= 0.7);
  assert.strictEqual(evalRes.arbiter_recommendation, 'APPROVE_PROMOTION');
  console.log(`✅ PASS: Polar equilibrium score: ${evalRes.equilibrium_score} (${evalRes.arbiter_recommendation})`);

  // 3. Reconcile mirror pair and promote validated snapshot
  const reconcileRes = await executeBioTool('genos_biomimicry_mirror_twin_fork', {
    action: 'reconcile_mirror',
    pair_id: 'pair-auth-refactor'
  });

  assert.strictEqual(reconcileRes.success, true);
  assert.strictEqual(reconcileRes.status, 'reconciled_promoted');
  console.log(`✅ PASS: Mirror pair reconciled into promoted snapshot: ${reconcileRes.promoted_snapshot_id}`);

  console.log('🎉 ALL MIRROR TWIN TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
