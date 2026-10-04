'use strict';

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= crypto.randomBytes(32).toString('hex');

const cases = [
  'test_aeis_e2e.js',
  'test_aeis_sandbox.js',
  'test_aeis_assembly_lifecycle.js',
  'test_aeis_cross_provider_verification.js',
  'test_aeis_homeostatic_runtime.js',
  'test_aeis_niche_recruitment.js',
  'test_aeis_process_isolation.js',
  'test_aeis_production_adapters.js',
  'test_aeis_provider_persistence.js',
  'test_aeis_runtime_integrations.js',
  'test_approve_run_deferred_promotion.js',
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
