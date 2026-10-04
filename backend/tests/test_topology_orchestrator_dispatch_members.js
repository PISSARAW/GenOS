'use strict';

const assert = require('node:assert/strict');
const { selectMembers } = require('../bin/topologyHandlers.cjs');

const members = [
  { role: 'host_orchestrator', executionMode: 'orchestrator', workerKind: null },
  { role: 'specialist_symbiont', executionMode: 'worker', workerKind: 'symbiotic_worker' },
  { role: 'immune_symbiont', executionMode: 'worker', workerKind: 'red_worker' },
  { role: 'memory_symbiont', executionMode: 'worker', workerKind: 'synthesis_worker' }
];

assert.deepEqual(selectMembers(members, 3), members.slice(1));
assert.throws(() => selectMembers(members, 2), { code: 'WORKER_GARAGE_FULL' });
assert.deepEqual(selectMembers([members[0]], 0), []);

console.log('Topology orchestrator dispatch selection: PASS');
