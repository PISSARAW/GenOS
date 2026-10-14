'use strict';

const assert = require('node:assert/strict');
const workerKinds = require('../src/services/agents/workerKindService');
const leases = require('../src/services/agents/workerContractLeaseService');

const supplied = [
  'genos_search_failures', 'genos_diagnose', 'genos_snapshot',
  'genos_organization_state', 'genos_worker_publish', 'genos_worker_inbox'
];

const liaison = leases.restrict(workerKinds.buildWorkerContract('liaison_worker'), supplied);
assert.deepEqual(liaison, [
  'genos_search_failures', 'genos_organization_state',
  'genos_worker_publish', 'genos_worker_inbox'
]);

const verifier = leases.restrict(workerKinds.buildWorkerContract('verifier_worker'), supplied);
assert.deepEqual(verifier, supplied);

console.log('Worker contract lease checks passed.');
