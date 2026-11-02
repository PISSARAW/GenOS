'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = [
  'test_evidence_protocol_contract.js',
  'test_evidence_protocol_conversation.js',
  'test_evidence_protocol_concurrency.js',
  'test_evidence_protocol_revision.js',
  'test_evidence_protocol_jury.js',
  'test_evidence_protocol_process_recovery.cjs',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`EVIDENCE protocol suite: ${tests.length} files passed.`);
