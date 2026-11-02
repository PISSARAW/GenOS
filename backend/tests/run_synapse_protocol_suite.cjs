'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = [
  'test_synapse_protocol_contract.js',
  'test_synapse_protocol_context.js',
  'test_synapse_conversation.js',
  'test_synapse_conversation_races.js',
  'test_synapse_acknowledgements.js',
  'test_synapse_acknowledgements_races.js',
  'test_synapse_protocol_process_recovery.js',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`SYNAPSE protocol suite: ${tests.length} files passed.`);
