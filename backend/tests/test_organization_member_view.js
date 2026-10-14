'use strict';

const assert = require('node:assert/strict');
const { organizationProfile } = require('../src/services/dynamicOrganizationService');
const { buildMemberState } = require('../src/services/communication/organizationMemberView');

const members = [
  { id: 'orch', name: 'Coordinator', role: 'orchestrator', executionMode: 'orchestrator' },
  { id: 'a', name: 'Identity Witness', role: 'identity_witness', executionMode: 'worker', parentAgentId: 'orch' },
  { id: 'b', name: 'Peer Mapper', role: 'peer_mapper', executionMode: 'worker', parentAgentId: 'orch' }
];

const committee = buildMemberState({
  orchestratorId: 'orch', organization: 'specialist_expert_committee',
  policy: organizationProfile('specialist_expert_committee')
}, 'a', members);
assert.equal(committee.requester.name, 'Identity Witness');
assert.equal(committee.communicationLinks.find((link) => link.agentId === 'orch').relationship, 'reports_to');
assert.deepEqual(committee.communicationLinks.find((link) => link.agentId === 'b').communication, {
  mode: 'mediated', channel: 'orchestrator_handoff', viaAgentId: 'orch'
});

const pod = buildMemberState({
  orchestratorId: 'orch', organization: 'cross_functional_pod',
  policy: organizationProfile('cross_functional_pod')
}, 'a', members);
assert.deepEqual(pod.communicationLinks.find((link) => link.agentId === 'b').communication, {
  mode: 'direct', channel: 'peer_mesh', viaAgentId: null
});

console.log('Organization member identity view: PASS');
