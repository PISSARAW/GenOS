const assert = require('assert');
const { executeBioTool } = require('../src/services/mcpBioTools');

async function runTest() {
  console.log('=== TESTING AGROBACTERIUM T-DNA HIJACK & OPINE HARVESTING ===');

  // 1. Initial status
  const initRes = await executeBioTool('genos_biomimicry_agrobacterium_tdna_hijack', {
    action: 'status',
    host_id: 'host-plant-1'
  });
  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.is_infected, false);
  console.log('✅ PASS: Initial uninfected host state verified');

  // 2. Inject T-DNA payload: forms crown gallus sandbox & produces opines
  const injectRes = await executeBioTool('genos_biomimicry_agrobacterium_tdna_hijack', {
    action: 'inject_tdna_payload',
    host_id: 'host-plant-1',
    tdna_payload: 'T_DNA_OCTOPINE_SYNTHASE',
    allocated_tokens: 1000
  });
  assert.strictEqual(injectRes.success, true);
  assert.strictEqual(injectRes.gallus_allocated_tokens, 1000);
  assert.strictEqual(injectRes.opine_yield_produced, 800);
  console.log('✅ PASS: Injected T-DNA formed gallus and produced 800 opines');

  // 3. Harvest opines
  const harvestRes = await executeBioTool('genos_biomimicry_agrobacterium_tdna_hijack', {
    action: 'harvest_opine_resources',
    host_id: 'host-plant-1'
  });
  assert.strictEqual(harvestRes.success, true);
  assert.strictEqual(harvestRes.harvested_amount, 800);
  assert.strictEqual(harvestRes.total_harvested, 800);
  console.log('✅ PASS: Harvested 800 opines successfully');

  console.log('🎉 ALL AGROBACTERIUM T-DNA TESTS PASSED!');
}

runTest().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
