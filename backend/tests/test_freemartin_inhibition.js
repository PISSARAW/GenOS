/**
 * Test: Freemartin Endocrine Inhibition (Free-martinisme Bovin)
 */

const assert = require('assert');
const { handle, FREEMARTIN_REGISTRY } = require('../src/services/mcpBioTools/handlers/freemartinInhibition');

async function runTests() {
  console.log('=== TESTING FREEMARTIN ENDOCRINE INHIBITION & WORKER SPECIALIZATION ===');
  FREEMARTIN_REGISTRY.clear();

  // Test 1: Apply endocrine inhibition to subordinate twin
  const dominantId = 'governor_orchestrator_prime';
  const subordinateId = 'worker_heavy_fuzzer_subordinate';

  const inhibitRes = await handle({
    action: 'apply_endocrine_inhibition',
    dominant_agent_id: dominantId,
    subordinate_agent_id: subordinateId,
    inhibition_strength: 0.90
  });

  assert.strictEqual(inhibitRes.success, true);
  assert.strictEqual(inhibitRes.status, 'freemartin_sterilization_active');
  assert.strictEqual(inhibitRes.can_spawn, false);
  assert.strictEqual(inhibitRes.can_fork, false);
  assert.strictEqual(inhibitRes.compute_boost_factor, 1.45);
  console.log('✅ PASS: Applied endocrine inhibition (Spawn/Fork disabled, +45% compute boost)');

  // Test 2: Verify freemartin status and lock
  const verifyRes = await handle({
    action: 'verify_freemartin_status',
    subordinate_agent_id: subordinateId
  });

  assert.strictEqual(verifyRes.success, true);
  assert.strictEqual(verifyRes.is_sterile, true);
  assert.strictEqual(verifyRes.can_fork, false);
  assert.strictEqual(verifyRes.dominant_governor, dominantId);
  console.log('✅ PASS: Verified freemartin sterility and governor authority');

  console.log('🎉 ALL FREEMARTIN INHIBITION TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
