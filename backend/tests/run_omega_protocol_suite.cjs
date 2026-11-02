'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = [
  'test_omega_protocol_contract.js',
  'test_omega_protocol_admission.js',
  'test_omega_protocol_execution.js',
  'test_omega_protocol_execution_safety.js',
  'test_omega_protocol_effects.js',
  'test_omega_protocol_effects_races.js',
  'test_omega_protocol_process_recovery.cjs',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`OMEGA Execution protocol suite: ${tests.length} files passed.`);
