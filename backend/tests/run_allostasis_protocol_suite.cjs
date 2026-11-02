'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = [
  'test_allostasis_protocol_contract.js',
  'test_allostasis_protocol_qualification.js',
  'test_allostasis_protocol_observations.js',
  'test_allostasis_allocator.js',
  'test_allostasis_allocator_races.js',
  'test_allostasis_usage.js',
  'test_allostasis_usage_safety.js',
  'test_allostasis_usage_transitions.js',
  'test_allostasis_protocol_process_recovery.js',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`ALLOSTASIE protocol suite: ${tests.length} files passed.`);
