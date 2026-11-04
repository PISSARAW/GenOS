'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = [
  'test_mission_protocols_context.js',
  'test_mission_protocols_runtime_boundaries.js',
  'test_mission_protocol_cleanup_failure.cjs',
  'test_mission_protocols_evidence.js',
  'test_mission_protocols_evidence_refusals.js',
  'test_mission_protocols_continuity.js',
  'test_mission_protocols_continuity_races.js',
  'test_mission_protocols_morph.js',
  'test_mission_protocols_morph_recovery.js',
  'test_mission_protocols_morph_guards.js',
  'test_mission_protocols_omega.js',
  'test_mission_protocols_omega_recovery.js',
  'test_mission_protocols_omega_inference.js',
  'test_mission_protocols_gqwf.js',
  'test_mission_protocols_gqwf_safety.js',
  'test_mission_protocols_synapse.js',
  'test_mission_protocols_synapse_lineage.js',
  'test_mission_protocols_local_worker.js',
  'test_mission_protocols_actions.js',
  'test_direct_worker_budget_scope.cjs',
  'test_direct_worker_control_run.cjs',
  'test_worker_clinical_booking.cjs',
  'test_mission_protocols_windows.js',
  'test_mission_protocols_windows_roster.js',
  'test_mission_protocols_allostasis.js',
  'test_mission_protocols_allostasis_races.js',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Mission protocol integration suite: ${tests.length} files passed.`);
