/**
 * Test: Obligate Polyembryony (Polyembryonie Obligatoire du Tatou)
 */

const assert = require('assert');
const { handle, POLYEMBRYONY_REGISTRY } = require('../src/services/mcpBioTools/handlers/obligatePolyembryony');

async function runTests() {
  console.log('=== TESTING OBLIGATE POLYEMBRYONY (ARMADILLO DETERMINISTIC QUADRUPLETS) ===');
  POLYEMBRYONY_REGISTRY.clear();

  // Test 1: Spawn obligate quadruplet clones
  const prompt = 'MISSION_CRITICAL_DISTRIBUTED_CONSENSUS_VERIFICATION';
  const totalBudget = 60000;

  const spawnRes = await handle({
    action: 'spawn_obligate_clones',
    parent_prompt: prompt,
    total_budget_tokens: totalBudget,
    cleavage_order: 4
  });

  assert.strictEqual(spawnRes.success, true);
  assert.strictEqual(spawnRes.status, 'obligate_polyembryony_cleaved');
  assert.strictEqual(spawnRes.cleavage_order, 4);
  assert.strictEqual(spawnRes.clones_count, 4);
  assert.strictEqual(spawnRes.budget_per_clone, 15000);
  assert.strictEqual(spawnRes.clones.every(c => c.isogenicIdentity === 1.0), true);
  console.log('✅ PASS: Cleaved into 4 deterministic isogenic clones (15,000 tokens budget each)');

  // Test 2: Evaluate polyembryonic quorum
  const cloneOutputs = [
    { clone_id: spawnRes.clones[0].cloneId, proposed_solution: 'PATCH_PLAN_ALPHA' },
    { clone_id: spawnRes.clones[1].cloneId, proposed_solution: 'PATCH_PLAN_ALPHA' },
    { clone_id: spawnRes.clones[2].cloneId, proposed_solution: 'PATCH_PLAN_ALPHA' },
    { clone_id: spawnRes.clones[3].cloneId, proposed_solution: 'PATCH_PLAN_BETA' }
  ];

  const quorumRes = await handle({
    action: 'evaluate_polyembryonic_quorum',
    cluster_id: spawnRes.cluster_id,
    clone_outputs: cloneOutputs
  });

  assert.strictEqual(quorumRes.success, true);
  assert.strictEqual(quorumRes.quorum_reached, true);
  assert.strictEqual(quorumRes.promoted_solution, 'PATCH_PLAN_ALPHA');
  assert.strictEqual(quorumRes.votes_for_top_solution, 3);
  console.log('✅ PASS: Evaluated isogenic quorum: 3/4 majority threshold met (Solution promoted)');

  console.log('🎉 ALL OBLIGATE POLYEMBRYONY TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
