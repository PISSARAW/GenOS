const assert = require('node:assert/strict');
const lease = require('../src/services/toolLeasePolicy');
const topology = require('../src/services/topologyCapabilityService');

const known = new Set(lease.KNOWN_TOOL_ALLOW_LIST);
for (const capability of topology.GENOS_CAPABILITIES) {
  assert.ok(Object.prototype.hasOwnProperty.call(lease.CAPABILITY_TOOLS, capability), `missing tool mapping for ${capability}`);
  for (const tool of lease.CAPABILITY_TOOLS[capability]) {
    assert.ok(known.has(tool), `capability ${capability} maps unknown tool ${tool}`);
  }
}

const base = lease.orchestratorCoreLease();
assert.deepEqual(lease.leaseForCapabilities(base, []), base);
assert.deepEqual(lease.leaseForCapabilities(base, ['SWARM_METRICS']), base);

const signaling = lease.leaseForCapabilities([], ['SIGNALING_BUS']);
assert.ok(signaling.includes('genos_worker_publish'));
assert.ok(signaling.includes('genos_worker_inbox'));
assert.equal(signaling.includes('genos_orchestrate'), false);

const withContract = lease.orchestratorLeaseForPlan({ capabilityContract: { required: ['IMMUNE_SYSTEM', 'SIGNALING_BUS'] } });
assert.ok(withContract.includes('genos_security_coevolution'));
assert.ok(withContract.includes('genos_parasitic_pressure'));
assert.ok(withContract.includes('genos_worker_publish'));
assert.equal(withContract.includes('genos_orchestrate'), false);

const withoutContract = lease.orchestratorLeaseForPlan({});
assert.deepEqual(withoutContract, base);

assert.ok(lease.leaseForCapabilities(base, ['CAPSULES_SNAPSHOTS']).includes('genos_snapshot'));

const foraging = lease.leaseForCapabilities([], ['WEB_FORAGING']);
assert.ok(foraging.includes('genos_browser_act'));
assert.ok(foraging.includes('genos_optimal_foraging'));
assert.deepEqual(lease.leaseForCapabilities([], ['FOVEAL_PERCEPTION']), ['genos_foveal_crop']);

console.log('Capability lease checks: PASS');
