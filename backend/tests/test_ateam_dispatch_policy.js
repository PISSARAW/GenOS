'use strict';

const assert = require('node:assert/strict');
const { prepareDispatchPolicy } = require('../src/services/aTeam/dispatchPolicyService');

const members = [
  { subSystem: 'api', label: 'api', role: 'backend', capabilities: ['api'], outputs: ['api-contract'], ownedResponsibilities: ['api'], criticality: 'critical' },
  { subSystem: 'web', label: 'web', role: 'frontend', capabilities: ['web'], dependsOn: ['api'], outputs: ['site'], ownedResponsibilities: ['web'] },
  { subSystem: 'security', label: 'security', role: 'security', capabilities: ['security', 'boundary_spanning'], dependsOn: ['api'], ownedResponsibilities: ['security'] }
];

function run() {
  const pipeline = prepareDispatchPolicy({
    mission: { goal: 'Release pipeline', variant: 'pipeline' }, members, totalBudget: 900
  });
  assert.deepEqual(pipeline.members.map((member) => member.dependsOn || []), [[], ['api'], ['api', 'web']]);
  assert.equal(pipeline.members[0].pipelineStage, 0);
  assert.equal(pipeline.members[2].pipelineStage, 2);
  assert.equal(pipeline.policy.variant, 'pipeline');
  assert.ok(pipeline.members.reduce((sum, member) => sum + member.executionBudgetTokens, 0) <= 900);
  assert.ok(pipeline.policy.budgetAllocation.allocations.find((allocation) => allocation.id === 'api').amount
    > pipeline.policy.budgetAllocation.allocations.find((allocation) => allocation.id === 'web').amount);
  const pod = prepareDispatchPolicy({ mission: { goal: 'Product feature', variant: 'cross_functional_pod' }, members });
  assert.ok(pod.members.find((member) => member.subSystem === 'api').consults.includes('web'));
  assert.equal(pod.policy.boundarySpanners[0].ownerMemberId, 'security');
  assert.throws(() => prepareDispatchPolicy({ mission: { variant: 'incident_command' }, members: members.slice(0, 2) }), { code: 'ATEAM_VARIANT_TEAM_TOO_SMALL' });
}

run();
console.log('A-Team dispatch applies variant behavior, interface ownership and per-worker budgets.');
