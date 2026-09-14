const assert = require('node:assert/strict');
const state = require('../src/services/agentOrchestrationState');

const baseline = state.workerToolLease('implementation');
assert.deepEqual(state.workerToolLeaseForCapabilities('implementation', []), baseline);
assert.deepEqual(state.workerToolLeaseForCapabilities('implementation', ['SWARM_METRICS']), baseline);

const immune = state.workerToolLeaseForCapabilities('implementation', ['IMMUNE_SYSTEM']);
assert.ok(immune.includes('genos_security_coevolution'));
assert.ok(immune.includes('genos_parasitic_pressure'));
assert.equal(immune.includes('genos_orchestrate'), false);

const reviewer = state.workerToolLeaseForCapabilities('independent_reviewer', []);
assert.ok(reviewer.includes('genos_adversarial_review'));
const signaling = state.workerToolLeaseForCapabilities('independent_reviewer', ['SIGNALING_BUS']);
assert.ok(signaling.includes('genos_worker_publish'));
assert.ok(signaling.includes('genos_worker_inbox'));

console.log('Worker capability lease checks: PASS');
