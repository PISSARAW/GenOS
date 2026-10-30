'use strict';

const assert = require('node:assert/strict');
const authority = require('../src/services/missionEnvelopeAuthority');
const { assertEvidenceAuthority } = require('../src/services/workerEvidenceBarrierLocal');

async function main() {
  const original = authority.assertRun;
  const refusal = Object.assign(new Error('Execution authority context changed.'), {
    code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED'
  });
  authority.assertRun = async () => { throw refusal; };
  try {
    await assert.rejects(assertEvidenceAuthority({}, { agentId: 'worker-a' }, { id: 'run-a' }), refusal);
  } finally {
    authority.assertRun = original;
  }
  console.log('Local worker evidence stage refuses a revoked execution authority: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
