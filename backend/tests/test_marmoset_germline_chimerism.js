/**
 * Test: Marmoset Germline Chimerism (Chimérisme Germinal du Ouistiti)
 */

const assert = require('assert');
const { handle, MARMOSET_REGISTRY } = require('../src/services/mcpBioTools/handlers/marmosetGermlineChimerism');

async function runTests() {
  console.log('=== TESTING MARMOSET GERMLINE CHIMERISM (FRATERNAL REPRODUCTIVE PROXY) ===');
  MARMOSET_REGISTRY.clear();

  // Test 1: Exchange germline payload between fraternal twins
  const donorId = 'agent_exhausted_discoverer_a';
  const proxyId = 'agent_healthy_survivor_b';
  const payload = {
    discovered_heuristics: ['zero_copy_mcts_indexer', 'bounded_exponential_jitter'],
    epigenetic_markers: { fitness_score: 0.99 }
  };

  const exchangeRes = await handle({
    action: 'exchange_germline_payload',
    donor_twin_id: donorId,
    proxy_twin_id: proxyId,
    germline_payload: payload
  });

  assert.strictEqual(exchangeRes.success, true);
  assert.strictEqual(exchangeRes.status, 'germline_chimerism_exchanged');
  assert.strictEqual(exchangeRes.donor_twin, donorId);
  assert.strictEqual(exchangeRes.proxy_twin, proxyId);
  console.log('✅ PASS: Exchanged germline cells from dying donor A to healthy proxy B');

  // Test 2: Spawn descendant through proxy B carrying donor A's DNA
  const spawnRes = await handle({
    action: 'spawn_proxy_descendant',
    exchange_id: exchangeRes.exchange_id,
    child_task_goal: 'continue_heavy_simulation'
  });

  assert.strictEqual(spawnRes.success, true);
  assert.strictEqual(spawnRes.status, 'proxy_descendant_spawned');
  assert.strictEqual(spawnRes.genetic_donor_parent, donorId);
  assert.strictEqual(spawnRes.gestational_proxy_parent, proxyId);
  console.log('✅ PASS: Spawned descendant via proxy B inheriting 100% of donor A lineage');

  // Test 3: Inspect germline heritage
  const inspectRes = await handle({
    action: 'inspect_germline_heritage',
    child_agent_id: spawnRes.child_agent_id
  });

  assert.strictEqual(inspectRes.success, true);
  assert.strictEqual(inspectRes.genetic_parent, donorId);
  assert.strictEqual(inspectRes.proxy_parent, proxyId);
  assert.strictEqual(inspectRes.inherited_heuristics.length, 2);
  console.log('✅ PASS: Inspected and validated dual parentage heritage trace');

  console.log('🎉 ALL MARMOSET GERMLINE CHIMERISM TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
