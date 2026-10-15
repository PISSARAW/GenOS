'use strict';

const assert = require('node:assert/strict');
const coordination = require('../src/services/aTeamCoordinationService');
const { prepareDispatchPolicy } = require('../src/services/aTeam/dispatchPolicyService');
const { alignTeamOrganization } = require('../src/services/aTeam/variantOrganizationAlignment');

const members = [
  { memberId: 'identity', role: 'identity_witness', capabilities: ['analysis'] },
  { memberId: 'peers', role: 'peer_mapper', capabilities: ['analysis'] },
  { memberId: 'relations', role: 'relationship_analyst', capabilities: ['analysis'] }
];
const team = coordination.coordinateMembers(members, { organization: 'specialist_expert_committee' });
team.members = members;
const dispatch = prepareDispatchPolicy({
  mission: { goal: 'Audit worker identities and relationships', teamVariant: 'cross_functional_pod' }, members
});
alignTeamOrganization(team, dispatch.policy, {
  goal: 'Audit worker identities and relationships', successCriteria: ['peer communication proven'], availableSlots: 3
});

assert.equal(dispatch.policy.organization, 'cross_functional_pod');
assert.equal(team.organization, 'cross_functional_pod');
assert.equal(team.capabilityContract.organization, 'cross_functional_pod');
assert.equal(team.teamContract.organization, 'cross_functional_pod');
assert.equal(team.readiness.ready, true);

const snakeCaseDispatch = prepareDispatchPolicy({
  mission: { goal: 'Audit worker identities and relationships', team_variant: 'cross_functional_pod' }, members
});
assert.equal(snakeCaseDispatch.policy.variant, 'cross_functional_pod');

console.log('A-Team variant organization alignment: PASS');
