'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const tests = [
  'test_concept_runtime.js', 'test_concept_campaigns.js',
  'test_reserved_replication_campaign.js', 'test_indicator_verification_boundary.js',
  'test_concept_model_extensions.js', 'test_concept_control_extensions.js',
  'test_iit_phi_adapter.js',
  'test_concept_action_lifecycle.js', 'test_external_campaign_boundaries.js',
  'test_concept_mechanism_campaigns.js',
  'test_concept_mcp_control.js',
  'test_concept_cycle_bridge.js',
  'test_consciousness_evidence_suite.js', 'test_generative_perceptual.js',
  'test_perceptive_binding.js', 'test_effector_inventory.js',
  'test_organ_ablation_bench.js', 'test_reverberation_causal_effect.js',
  'test_replicated_causal_validation_service.js', 'test_replicated_causal_runtime_integration.js',
  'test_truth_graph_semantic_pipeline.js'
];
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit',
    env: { ...process.env, GENOS_AGOW_MODE: 'off' } });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Concept implementation suite passed: ' + tests.length + ' tests; no scientific promotion implied.');
