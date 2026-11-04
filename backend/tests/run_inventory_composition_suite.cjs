'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tests = ['test_inventory_p0.cjs', 'test_inventory_p1.cjs', 'test_inventory_learning_loop.cjs',
  'test_autobiographical_memory.js', 'test_autobiographical_orchestrator_recall.js',
  'test_organization_catalog_parity.cjs', 'test_philosophical_concept_registry.js',
  'test_gqel_native_contracts.cjs', 'test_gqel_v2.cjs', 'test_gqel_progress.cjs',
  'test_topology_worker_incarnation.cjs', 'test_endogenous_thought_mission.cjs',
  'test_ateam_relational_handoffs.cjs', 'test_gqel_grounded_quotes.cjs',
  'test_gqel_native_narrative.cjs', 'test_mission_mechanisms.cjs',
  'test_gqel_creative_metadata_bounds.cjs',
  'test_gqel_scene_repetition.cjs', 'test_gqel_scene_generation.cjs',
  'test_gqel_native_context_order.cjs', 'test_gqel_screenplay_package.cjs',
  'test_gqel_plan_repetition.cjs',
  'test_ateam_runner_lease.cjs',
  'test_model_provider_deadline.cjs',
  'test_morphogenesis_p3_qualification.js', 'test_morphogenesis_transition_compensation.js',
  'test_morphogenesis_resource_transition_receipt.js', 'test_morphogenesis_communication_transition_receipt.js'];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit',
    windowsHide: true, timeout: 180000, env: { ...process.env, GENOS_DISABLE_DOTENV: '1',
      GENOS_DB_BACKUP_SKIP: '1', GENOS_AGOW_MODE: 'off' } });
  if (result.status !== 0) {
    console.error(test, result.error?.message || `exit ${result.status}`);
    process.exit(result.status || 1);
  }
}
console.log(`Inventory composition: ${tests.length}/${tests.length} suites PASS.`);
