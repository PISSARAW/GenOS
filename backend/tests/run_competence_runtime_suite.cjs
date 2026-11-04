'use strict';

const {spawnSync} = require('node:child_process');
const path = require('node:path');

const files = [
  'test_worker_inference_limits.cjs',
  'test_local_workspace_bootstrap.cjs',
  'test_truth_graph_mission_identity.cjs',
  'test_local_orchestrator_model_forwarding.cjs',
  'test_worker_required_evidence_schema.cjs',
  'test_function_induction_oracle.cjs',
  'test_trinity_requested_method_scope.cjs',
  '../../benchmarks/competence-full-runtime/test.cjs',
  '../../benchmarks/competence-full-runtime/test-control.mjs',
  '../../benchmarks/competence-full-runtime/test-integrity.cjs'
];

for (const file of files) {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, file)],
    {stdio: 'inherit', env: process.env, windowsHide: true});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
