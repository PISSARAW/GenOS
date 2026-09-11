/**
 * Test: Fetus in Fetu (Encapsulation Endoparasitaire & Emergency Resurrection)
 */

const assert = require('assert');
const { handle, FETUS_REGISTRY } = require('../src/services/mcpBioTools/handlers/fetusInFetu');

async function runTests() {
  console.log('=== TESTING FETUS IN FETU & EMERGENCY RESURRECTION ===');
  FETUS_REGISTRY.clear();

  // Test 1: Encapsulate inner dormant fetus
  const hostId = 'agent_host_alpha_99';
  const cleanCheckpoint = {
    step: 42,
    memory: ['clean_state_1', 'verified_token_store'],
    tools: ['exec', 'read_fs']
  };

  const encRes = await handle({
    action: 'encapsulate_inner_fetus',
    host_agent_id: hostId,
    fetus_agent_id: 'embryo_backup_pod_1',
    clean_checkpoint: cleanCheckpoint,
    rescue_trigger_policy: 'on_adversarial_corruption'
  });

  assert.strictEqual(encRes.success, true);
  assert.strictEqual(encRes.status, 'encapsulated');
  assert.strictEqual(encRes.metabolic_overhead, 0);
  assert.ok(encRes.dormancy_checksum);
  console.log('✅ PASS: Encapsulated dormant fetus with zero metabolic overhead');

  // Test 2: Inspect encapsulated state
  const inspectRes = await handle({
    action: 'inspect_encapsulated_state',
    host_agent_id: hostId
  });

  assert.strictEqual(inspectRes.success, true);
  assert.strictEqual(inspectRes.state, 'dormant');
  assert.strictEqual(inspectRes.integrity_valid, true);
  console.log('✅ PASS: Inspected encapsulated fetus state and confirmed integrity');

  // Test 3: Trigger emergency resurrection upon host collapse/corruption
  const resurrectRes = await handle({
    action: 'trigger_emergency_resurrection',
    host_agent_id: hostId,
    failure_reason: 'adversarial_prompt_injection_detected'
  });

  assert.strictEqual(resurrectRes.success, true);
  assert.strictEqual(resurrectRes.status, 'emergency_resurrection_complete');
  assert.strictEqual(resurrectRes.purged_host_id, hostId);
  assert.strictEqual(resurrectRes.integrity_verified, true);
  assert.strictEqual(resurrectRes.checkpoint_restored.step, 42);
  assert.strictEqual(resurrectRes.active_resurrected_id, 'resurrected_embryo_backup_pod_1');
  console.log('✅ PASS: Purged corrupted host and hatched clean resurrected agent');

  console.log('🎉 ALL FETUS IN FETU TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
