'use strict';

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= crypto.randomBytes(32).toString('hex');

const cases = [
  'test_aeis_e2e.js',
  'test_aeis_promotion_limits.js',
  'test_aeis_sandbox.js',
  'test_aeis_execution_timeouts.js',
  'test_aeis_assembly_lifecycle.js',
  'test_aeis_cross_provider_verification.js',
  'test_aeis_homeostatic_runtime.js',
  'test_aeis_homeostatic_arbitration.js',
  'test_aeis_verifier_lineage.js',
  'test_aeis_niche_recruitment.js',
  'test_aeis_process_isolation.js',
  'test_aeis_worker_database_isolation.js',
  'test_aeis_provider_process_roundtrip.js',
  'test_aeis_production_adapters.js',
  'test_aeis_provider_persistence.js',
  'test_aeis_runtime_integrations.js',
  'test_promotion_verifier_nonces.js',
  'test_approve_run_deferred_promotion.js',
  'test_aeis_provider_approve_run.js',
  'test_epistemic_immune_memory_persistence.js',
  'immune_memory_test.js',
  'adaptive_immune_response_test.js',
  'epistemic_homeostasis_test.js',
  'epistemic_inflation_regulation_test.js',
  'epistemic_biocenose_test.js',
  'epistemic_metapopulation_test.js',
  'epistemic_stigmergy_test.js',
  'epistemic_apoptosis_test.js',
  'epistemic_apoptosis_authority_bridge_test.js',
  'test_aeis_authority_persistence.js',
  'epistemic_ecological_selection_test.js',
  'epistemic_challenge_test.js',
  'epistemic_benchmark_integration_test.js',
  'test_epistemic_assurance.js',
  'test_epistemic_promotion_integration.js',
  'test_epistemic_persistence.js',
  'epistemic_holobionte_test.js',
  'verifier_execution_test.js',
  'clonal_expansion_test.js',
  'affinity_maturation_test.js',
  '../../benchmarks/eab/run-aeis-eab.cjs',
];

for (const item of cases) {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, item)], {
    stdio: 'inherit', env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('AEIS: ' + cases.length + ' suites and benchmark completed successfully.');
