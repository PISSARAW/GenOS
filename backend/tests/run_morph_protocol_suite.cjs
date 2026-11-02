'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = [
  'test_morph_protocol_contract.js',
  'test_morph_protocol_conservation.js',
  'test_morph_protocol_coordinator.js',
  'test_morph_protocol_coordinator_races.js',
  'test_morph_protocol_participant.js',
  'test_morph_protocol_participant_races.js',
  'test_morph_protocol_process_recovery.cjs',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`MORPH protocol suite: ${tests.length} files passed.`);
