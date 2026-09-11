/**
 * Test: Superfetation Pipeline (Superfétation / Gestation Asynchrone)
 */

const assert = require('assert');
const { handle, SUPERFETATION_REGISTRY } = require('../src/services/mcpBioTools/handlers/superfetationPipeline');

async function runTests() {
  console.log('=== TESTING SUPERFETATION PIPELINE (ASYNCHRONOUS CO-GESTATION) ===');
  SUPERFETATION_REGISTRY.clear();

  // Test 1: Spawn cadet embryo alongside mature elder agent
  const elderId = 'agent_elder_synthesizer_v2';
  const elderSteps = 45;
  const elderCache = {
    verified_facts: ['architecture_validated', 'ast_transformed', 'security_invariants_met'],
    checkpoint_index: 8
  };

  const spawnRes = await handle({
    action: 'superfetate_secondary_embryo',
    elder_agent_id: elderId,
    elder_gestational_age_steps: elderSteps,
    elder_knowledge_cache: elderCache,
    cadet_specialized_task: 'fuzz_edge_cases'
  });

  assert.strictEqual(spawnRes.success, true);
  assert.strictEqual(spawnRes.status, 'superfetation_initialized');
  assert.strictEqual(spawnRes.gestational_age_gap, 45);
  assert.strictEqual(spawnRes.cadet_agent.gestationalAgeSteps, 0);
  assert.strictEqual(spawnRes.cadet_agent.specializedTask, 'fuzz_edge_cases');
  assert.strictEqual(spawnRes.knowledge_inherited, true);
  console.log('✅ PASS: Initialized superfetation co-gestation with 45-step gestational delta');

  // Test 2: Synchronize gestational difference and accelerate cadet
  const syncRes = await handle({
    action: 'synchronize_gestational_diff',
    pipeline_id: spawnRes.pipeline_id,
    cadet_step_increment: 20,
    elder_step_increment: 2
  });

  assert.strictEqual(syncRes.success, true);
  assert.strictEqual(syncRes.status, 'gestation_synchronized');
  assert.strictEqual(syncRes.cadet_steps, 20);
  assert.strictEqual(syncRes.elder_steps, 47);
  assert.strictEqual(syncRes.remaining_gestational_gap, 27);
  console.log('✅ PASS: Gestation synchronized (Cadet advanced to step 20, Elder at 47, Gap: 27)');

  console.log('🎉 ALL SUPERFETATION PIPELINE TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
