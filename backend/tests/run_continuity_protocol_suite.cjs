'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = [
  'test_continuity_protocol_contract.js',
  'test_continuity_protocol_recognition.js',
  'test_continuity_protocol_handoff.js',
  'test_continuity_protocol_handoff_races.js',
  'test_continuity_protocol_fencing.js',
  'test_continuity_protocol_process_recovery.cjs',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`CONTINUITY protocol suite: ${tests.length} files passed.`);
