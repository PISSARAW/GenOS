const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING MONOZYGOTIC ISOGENIC TWIN CLEAVAGE ===');

  // 1. Cleave a single zygotic agent into 3 identical isogenic clones
  const splitRes = await executeBioTool('genos_biomimicry_monozygotic_split', {
    action: 'cleave_monozygotic_twins',
    cluster_id: 'cluster-mono-test',
    parent_genome_id: 'gen-zygote-alpha',
    snapshot_id: 'snp-cleavage-001',
    clone_count: 3,
    seeds: [101, 202, 303]
  });

  assert.strictEqual(splitRes.success, true);
  assert.strictEqual(splitRes.status, 'monozygotic_cleaved');
  assert.strictEqual(splitRes.clone_count, 3);
  assert.strictEqual(splitRes.clones[0].isogenicIdentityPercent, 100);
  assert.strictEqual(splitRes.clones[0].genomeDnaHash, splitRes.clones[1].genomeDnaHash);
  console.log(`✅ PASS: Cleaved ${splitRes.clone_count} isogenic twin clones sharing identical DNA hash`);

  // 2. Synchronize cleavage state across branches
  const syncRes = await executeBioTool('genos_biomimicry_monozygotic_split', {
    action: 'synchronize_cleavage_state',
    cluster_id: 'cluster-mono-test',
    trajectories: ['branch_1', 'branch_2', 'branch_3']
  });

  assert.strictEqual(syncRes.success, true);
  assert.strictEqual(syncRes.status, 'cleavage_synchronized');
  assert.strictEqual(syncRes.divergence_metrics.isogenicLineageStable, true);
  console.log('✅ PASS: Isogenic twin trajectories synchronized');

  console.log('🎉 ALL MONOZYGOTIC SPLIT TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
