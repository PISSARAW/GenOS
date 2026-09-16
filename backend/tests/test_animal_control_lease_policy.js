const assert = require('node:assert/strict');
const leasePolicy = require('../src/services/toolLeasePolicy');

const lease = leasePolicy.orchestratorLeaseForPlan({
  capabilityContract: { required: ['STIGMERGY', 'FOVEAL_PERCEPTION', 'IMMUNE_SYSTEM'] }
});

assert(lease.includes('genos_execute_primitive'));
assert(lease.includes('genos_worker_publish'));
assert(lease.includes('genos_foveal_crop'));
assert(lease.includes('genos_security_coevolution'));
assert.equal(lease.filter((tool) => tool === 'genos_execute_primitive').length, 1);

const restricted = leasePolicy.restrictProvidedLease(['genos_execute_primitive', 'genos_orchestrate'], lease);
assert.deepEqual(restricted, ['genos_execute_primitive']);

console.log('Animal control lease policy checks passed.');