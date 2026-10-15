'use strict';

const assert = require('node:assert/strict');
const { buildWorkerContract } = require('../src/services/agents/workerKindService');

for (const workerKind of ['forensic_worker', 'liaison_worker', 'verifier_worker']) {
  const allocated = buildWorkerContract(workerKind, { workerTokenLimit: 99999 });
  assert.equal(allocated.resources.maxTokens, 40000);
  assert.equal(buildWorkerContract(workerKind).resources.maxTokens, 8000);
}

console.log('Social worker resource policy: PASS');
