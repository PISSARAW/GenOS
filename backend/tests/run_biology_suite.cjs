'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const cases = [
  'test_homeostasis_durable_authority.js', 'test_homeostasis_authority_receipts.js',
  'test_biological_ingestion_atomic.js', 'test_biological_receipt_ingestion.js',
  'test_biological_worker_receipts.js', 'test_biological_worker_restart.js', 'test_biological_receipt_audit.js'
];
let failures = 0;
for (const filename of cases) {
  const result = spawnSync(process.execPath, [path.join(__dirname, filename)],
    { stdio: 'inherit', timeout: 180000, windowsHide: true });
  if (result.status === 0) continue;
  failures += 1;
  console.error(`Biology validation failed: ${filename}: ${result.error?.message || result.status}`);
}
console.log(`Biology suite: ${cases.length - failures}/${cases.length} passed.`);
process.exitCode = failures ? 1 : 0;
