const { spawnSync } = require('node:child_process');
const path = require('node:path');

const tests = [
  'test_worker_audit_defects_regression.js',
  'test_worker_proof_authority.js',
  'test_local_worker_completion_process.js',
  'test_worker_recovery_enqueue_failure.js',
  'test_worker_recovery_redispatch.js',
  'test_quality_control_flow.js',
  'test_evaluation_graders.js',
  'test_evaluation_worker.js',
  'test_evaluation_checkpoint_integrity.js',
  'test_evaluation_checkpoint_score.js',
  'test_evaluation_grader_completeness.js',
  'test_evaluation_campaign_scope.js',
  'test_evaluation_provenance_hash.js',
  'test_evaluation_reproducibility.js',
  'test_evaluation_result_normalization.js',
  'test_metric_semantics.js',
  'test_historical_quality_refactors.js',
  'test_no_answer_proof_remediation.js',
  'test_polite_liars_benchmark.js'
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], {
    stdio: 'inherit',
    env: { ...process.env, GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD || 'quality-suite-only' }
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Quality suite passed: ${tests.length} tests.`);
