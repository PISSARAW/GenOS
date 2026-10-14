const assert = require('node:assert/strict');
const routing = require('../src/services/organizationRouting');
const { organizationProfile } = require('../src/services/dynamicOrganizationService');

const committee = organizationProfile('specialist_expert_committee');
const committeeState = { orchestratorId: 'orch', policy: committee, organization: 'specialist_expert_committee' };
const direct = routing.routeMessage({ state: committeeState, sender: { id: 'w1', role: 'worker' }, recipientAgentId: null, kind: 'evidence' });
assert.equal(direct.recipientAgentId, 'orch');
assert.equal(direct.channel, 'orchestrator_handoff');
assert.equal(direct.delivery, 'delivered');

const silence = organizationProfile('network_silence');
const buffered = routing.routeMessage({ state: { orchestratorId: 'orch', policy: silence }, sender: { id: 'w1', role: 'worker' }, recipientAgentId: null, kind: 'evidence' });
assert.equal(buffered.delivery, 'buffered');

const wolf = organizationProfile('grey_wolf_optimizer');
assert.throws(
  () => routing.assertRoutingAuthority({ organization: 'grey_wolf_optimizer', policy: wolf, sender: { id: 'w1', role: 'omega' }, recipientAgentId: 'w2', orchestratorId: 'orch' }),
  (error) => error.code === 'ORGANIZATION_AUTHORITY_VIOLATION'
);
assert.doesNotThrow(() => routing.assertRoutingAuthority({ organization: 'grey_wolf_optimizer', policy: wolf, sender: { id: 'w1', role: 'omega' }, recipientAgentId: 'orch', orchestratorId: 'orch' }));
assert.doesNotThrow(() => routing.assertRoutingAuthority({ organization: 'grey_wolf_optimizer', policy: wolf, sender: { id: 'w1', role: 'alpha' }, recipientAgentId: 'w2', orchestratorId: 'orch' }));
assert.doesNotThrow(() => routing.assertRoutingAuthority({ organization: 'specialist_expert_committee', policy: committee, sender: { id: 'w1', role: 'worker' }, recipientAgentId: 'w2', orchestratorId: 'orch' }));

const pod = organizationProfile('cross_functional_pod');
const podState = { orchestratorId: 'orch', policy: pod, organization: 'cross_functional_pod' };
const peer = routing.routeMessage({ state: podState, sender: { id: 'w1', role: 'worker' }, recipientAgentId: 'w2', kind: 'question' });
assert.equal(peer.recipientAgentId, 'w2');
assert.equal(peer.channel, 'peer_mesh');
const podBroadcast = routing.routeMessage({ state: podState, sender: { id: 'w1', role: 'worker' }, recipientAgentId: null, kind: 'evidence' });
assert.equal(podBroadcast.recipientAgentId, null);
assert.equal(podBroadcast.channel, 'peer_mesh');

console.log('Organization routing authority checks: PASS');
