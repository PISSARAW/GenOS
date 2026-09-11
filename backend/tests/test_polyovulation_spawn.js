const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING POLYOVALATION DIZYGOTIC SPAWN ===');

  // 1. Spawn a dizygotic heterogeneous fleet in a shared workspace
  const spawnRes = await executeBioTool('genos_biomimicry_polyovulation_spawn', {
    action: 'spawn_dizygotic_fleet',
    fleet_id: 'fleet-dizygotic-test',
    workspace_id: 'ws-polyovular-core',
    mission: 'Analyze multi-layer architectural vulnerability',
    profiles: [
      { role: 'FormalVerifier', model: 'claude-3-5-sonnet', heuristic: 'coq_invariants' },
      { role: 'HeuristicFuzzer', model: 'gpt-4o', heuristic: 'chaos_injection' },
      { role: 'StaticAnalyzer', model: 'qwen2.5-coder', heuristic: 'ast_scanning' }
    ]
  });

  assert.strictEqual(spawnRes.success, true);
  assert.strictEqual(spawnRes.status, 'dizygotic_fleet_spawned');
  assert.strictEqual(spawnRes.spawned_embryos_count, 3);
  assert.strictEqual(spawnRes.diversity_index, 1.0);
  console.log(`✅ PASS: Spawned ${spawnRes.spawned_embryos_count} dizygotic embryos (Diversity: ${spawnRes.diversity_index})`);

  // 2. Inspect fleet genetic diversity across lineages
  const inspectRes = await executeBioTool('genos_biomimicry_polyovulation_spawn', {
    action: 'inspect_fleet_diversity',
    fleet_id: 'fleet-dizygotic-test'
  });

  assert.strictEqual(inspectRes.success, true);
  assert.strictEqual(inspectRes.unique_lineages_count, 3);
  console.log(`✅ PASS: Inspected diversity: ${inspectRes.unique_lineages_count} unique lineages verified`);

  console.log('🎉 ALL POLYOVALATION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
