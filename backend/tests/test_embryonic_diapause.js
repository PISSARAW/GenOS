/**
 * Test: Embryonic Diapause Pipeline (Gestation Séquentielle & Diapause)
 */

const assert = require('assert');
const { handle, DIAPAUSE_REGISTRY } = require('../src/services/mcpBioTools/handlers/embryonicDiapause');

async function runTests() {
  console.log('=== TESTING EMBRYONIC DIAPAUSE (3-TIER ZERO-LATENCY SEQUENTIAL PIPELINE) ===');
  DIAPAUSE_REGISTRY.clear();

  // Test 1: Initialize 3-tier pipeline
  const initRes = await handle({
    action: 'initialize_diapause_pipeline',
    tier1_task: 'production_deployment_verification',
    tier2_task: 'active_code_synthesis',
    tier3_task: 'dormant_refactoring_candidate'
  });

  assert.strictEqual(initRes.success, true);
  assert.strictEqual(initRes.status, 'diapause_pipeline_initialized');
  assert.strictEqual(initRes.tier_3_diapause.status, 'diapause_frozen');
  assert.strictEqual(initRes.tier_3_diapause.metabolicOverhead, 0);
  console.log('✅ PASS: Initialized 3-tier pipeline with Tier 3 in zero-cost diapause');

  // Test 2: Advance pipeline (Egress Tier 1 -> Promote Tier 2 -> Thaw Tier 3)
  const advanceRes = await handle({
    action: 'advance_pipeline_egress',
    pipeline_id: initRes.pipeline_id,
    next_diapause_task: 'future_optimization_task'
  });

  assert.strictEqual(advanceRes.success, true);
  assert.strictEqual(advanceRes.status, 'pipeline_advanced_successfully');
  assert.strictEqual(advanceRes.promoted_tier1_id, initRes.tier_2_active.agentId);
  assert.strictEqual(advanceRes.thawed_tier2_id, initRes.tier_3_diapause.agentId);
  assert.strictEqual(advanceRes.cycles_completed, 1);
  console.log('✅ PASS: Advanced pipeline (Tier 2 promoted to Tier 1, Tier 3 thawed with 0ms latency)');

  // Test 3: Inspect stages
  const inspectRes = await handle({
    action: 'inspect_pipeline_stages',
    pipeline_id: initRes.pipeline_id
  });

  assert.strictEqual(inspectRes.success, true);
  assert.strictEqual(inspectRes.tier2_active_pouch.status, 'thawed_active');
  assert.strictEqual(inspectRes.tier3_diapause_uterus.status, 'diapause_frozen');
  console.log('✅ PASS: Inspected pipeline state and validated ongoing continuous flow');

  console.log('🎉 ALL EMBRYONIC DIAPAUSE TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
