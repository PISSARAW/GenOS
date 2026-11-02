'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = [
  'test_gqwf_exchange_contract.js',
  'test_gqwf_exchange_qualification.js',
  'test_gqwf_exchange_transfer.js',
  'test_gqwf_exchange_transfer_safety.js',
  'test_gqwf_exchange_promotion.js',
  'test_gqwf_exchange_promotion_races.js',
  'test_gqwf_exchange_process_recovery.js',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`GQWF Exchange protocol suite: ${tests.length} files passed.`);
