'use strict';

const assert = require('assert');
const { buildVariantPlan, selectVariant, scoreVariant, getVariantInfo, listVariants } = require('../src/services/aTeam/variants/variantRegistry');
const { planOrganizations, transitionOrganization } = require('../src/services/aTeam/variants/teamOrganizationController');
const { buildOperationalPolicy } = require('../src/services/aTeam/variants/operationalVariantPolicy');

function run() {
  console.log('Testing A-Team variant policies...');

  // Test basic variant registry
  assert.equal(buildVariantPlan({ variant: 'pipeline' }).communication, 'sequential_handoff');
  assert.equal(buildVariantPlan({ goal: 'urgent zero-day incident' }).variant, 'tiger_team');
  assert.equal(buildVariantPlan({ teamCount: 3 }).variant, 'multiteam');
  assert.equal(planOrganizations({ phases: [{ id: 'build', variant: 'project_dag' }, { id: 'incident', variant: 'incident_command' }] }).length, 2);
  const moved = transitionOrganization({ variant: 'project_dag' }, { variant: 'tiger_team' }, { reason: 'incident_detected' });
  assert.equal(moved.changed, true);
  assert.throws(() => buildVariantPlan({ variant: 'imaginary' }), { code: 'ATEAM_VARIANT_UNKNOWN' });

  // Test all 11 variants exist
  const variants = listVariants();
  assert.equal(variants.length, 11);
  const variantIds = variants.map((v) => v.id).sort();
  assert.deepStrictEqual(variantIds, [
    'adaptive',
    'boundary_spanner',
    'cross_functional_pod',
    'expert_committee',
    'incident_command',
    'matrix_team',
    'multiteam',
    'pipeline',
    'project_dag',
    'relay_team',
    'tiger_team'
  ]);

  // Test each variant has required fields
  for (const variant of variants) {
    assert(variant.organization, `Variant ${variant.id} missing organization`);
    assert(Number.isInteger(variant.minMembers) && variant.minMembers >= 2, `Variant ${variant.id} invalid minMembers`);
    assert(variant.communication, `Variant ${variant.id} missing communication`);
    assert(variant.authority, `Variant ${variant.id} missing authority`);
    assert(variant.maturity === 'implemented' || variant.maturity === 'partial', `Variant ${variant.id} invalid maturity`);
    assert(variant.description, `Variant ${variant.id} missing description`);
    assert(Array.isArray(variant.fullPotential), `Variant ${variant.id} missing fullPotential`);
    assert(Array.isArray(variant.requiredCapabilities), `Variant ${variant.id} missing requiredCapabilities`);
    assert(Array.isArray(variant.preconditions), `Variant ${variant.id} missing preconditions`);
  }

  // Test scoring (counts signal hits; most hits wins selection)
  assert.ok(scoreVariant('tiger_team', { goal: 'urgent zero-day incident' }) >= 1);
  assert.equal(scoreVariant('tiger_team', { goal: 'routine maintenance' }), 0);
  assert.ok(scoreVariant('pipeline', { goal: 'extract transform publish' }) >= 1);
  assert.ok(scoreVariant('project_dag', { parallelWorkstreams: 3 }) >= 1);
  assert.ok(scoreVariant('cross_functional_pod', { goal: 'build feature end to end' }) >= 1);
  assert.ok(scoreVariant('boundary_spanner', { interfaceCount: 3 }) >= 1);
  assert.ok(scoreVariant('matrix_team', { functionalAndProductOwners: true }) >= 1);
  assert.ok(scoreVariant('multiteam', { teamCount: 3 }) >= 1);
  assert.ok(scoreVariant('adaptive', { uncertainty: 0.8 }) >= 1);
  assert.ok(scoreVariant('relay_team', { singleContextOwner: true }) >= 1);
  assert.ok(scoreVariant('incident_command', { goal: 'incident multi-team outage' }) >= 1);
  assert.equal(scoreVariant('tiger_team', { goal: 'logistics review' }), 0);
  assert.equal(scoreVariant('incident_command', { goal: 'logistics review' }), 0);

  // Test selectVariant (best score wins; ties keep registry order; baseline otherwise)
  assert.equal(selectVariant({ variant: 'pipeline' }), 'pipeline');
  assert.equal(selectVariant({ goal: 'urgent incident' }), 'tiger_team');
  assert.equal(selectVariant({ goal: 'incident multi-team outage' }), 'incident_command');
  assert.equal(selectVariant({ teamCount: 2 }), 'multiteam');
  assert.equal(selectVariant({}), 'expert_committee');

  // Test getVariantInfo
  const expertInfo = getVariantInfo('expert_committee');
  assert.equal(expertInfo.id, 'expert_committee');
  assert.equal(expertInfo.minMembers, 3);
  assert.equal(getVariantInfo('nonexistent'), null);

  // Test operational policy for each variant
  const baseMission = { minMembers: 3 };
  const baseMembers = [
    { memberId: 'm1', expertise: ['security', 'backend'], capabilities: ['security', 'backend'] },
    { memberId: 'm2', expertise: ['frontend', 'api'], capabilities: ['frontend', 'api'] },
    { memberId: 'm3', expertise: ['devops', 'infrastructure'], capabilities: ['devops', 'infrastructure'] }
  ];
  const baseBoundaries = { interfaces: [{ id: 'b1', from: 'backend', to: 'frontend' }] };

  // Expert Committee
  let policy = buildOperationalPolicy({ mission: { ...baseMission, consensusProtocol: { quorum: 2 } }, plan: { variant: 'expert_committee' }, members: baseMembers });
  assert(policy.expertiseMatrix);
  assert(policy.expertiseConflicts);
  assert(policy.independence);
  assert(policy.consensusProtocol);
  assert(policy.calibrationRequired);
  assert(policy.dissentProtocol);

  // Pipeline
  policy = buildOperationalPolicy({
    mission: { stages: [{ stageId: 's1', memberId: 'm1', name: 'Stage 1', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } }] },
    plan: { variant: 'pipeline' },
    members: baseMembers
  });
  assert(policy.pipelineStages);
  assert(policy.stageContracts);
  assert(policy.executionModel);
  assert(policy.executionModel.backpressure);
  assert(policy.executionModel.localRetry);
  assert(policy.executionModel.stageCache);
  assert(policy.executionModel.resumeFromLastValid);

  // Project DAG
  policy = buildOperationalPolicy({
    mission: { dagNodes: [{ nodeId: 'n1', memberId: 'm1', name: 'Node 1', dependencies: [], inputSchema: { type: 'object' }, outputSchema: { type: 'object' } }] },
    plan: { variant: 'project_dag' },
    members: baseMembers
  });
  assert(policy.dagNodes);
  assert(policy.dagEdges);
  assert(policy.executionModel);
  assert(policy.executionModel.criticalPathScheduler);
  assert(policy.executionModel.resourceScheduling);
  assert(policy.executionModel.typedFanInOut);
  assert(policy.executionModel.incrementalInvalidation);

// Cross-Functional Pod
  policy = buildOperationalPolicy({
    mission: { externalDependencyLimit: 2 },
    plan: { variant: 'cross_functional_pod' },
    members: baseMembers.map((m, i) => ({ ...m, ownedResponsibilities: [`artifact${i + 1}`] }))
  });
  assert(policy.artifactOwners);
  assert(policy.externalDependencyLimit === 2);
  assert(policy.autonomyMetric);
  assert(policy.contractualBoundaries);
  assert(policy.fullLifecycleOwnership);

  // Boundary Spanner
  policy = buildOperationalPolicy({
    mission: { interfaceContracts: [{
      fromDomain: 'backend', toDomain: 'frontend', contractId: 'api-boundary-v1', version: 1,
      provenance: { sourceRefs: ['artifact:interface-contract'] },
      semanticSchema: { type: 'object', properties: { payload: { type: 'string' } } },
      translationSchema: {
        inputFormat: 'json', outputFormat: 'json', transformationRules: ['preserve_payload']
      }
    }] },
    plan: { variant: 'boundary_spanner' },
    members: baseMembers,
    boundaries: { interfaces: [{ id: 'b1', from: 'backend', to: 'frontend' }] }
  });
  assert(policy.interfaceContracts);
  assert(policy.semanticDriftCheck);
  assert(policy.globalCompatibilityMatrix);

  // Matrix Team
  policy = buildOperationalPolicy({
    mission: { decisionAuthorities: [{ decisionType: 'arch', functionalOwnerId: 'm1', productOwnerId: 'm2' }] },
    plan: { variant: 'matrix_team' },
    members: baseMembers
  });
  assert(policy.decisionAuthorities);
  assert(policy.raciMatrix);
  assert(policy.disagreementResolution);
  assert(policy.transactionalResolution);
  assert(policy.escalationPaths);

  // Tiger Team
  policy = buildOperationalPolicy({
    mission: { urgentMandate: { scope: 'fix critical bug', timeboxMinutes: 60, stopCriteria: ['bug_fixed', 'tests_pass'] } },
    plan: { variant: 'tiger_team' },
    members: baseMembers
  });
  assert(policy.urgentMandate);
  assert(policy.urgentMandate.hardTimebox);
  assert(policy.urgentMandate.emergencyScope);
  assert(policy.urgentMandate.auditTrail);
  assert(policy.urgentMandate.privilegeReturn);
  assert(policy.urgentMandate.postMortem);

  // Incident Command
  policy = buildOperationalPolicy({
    mission: { incidentRoles: { commander: 'm1', operations: 'm2', planning: 'm3', logistics: 'm3' }, sitrepIntervalMinutes: 15, operationalObjectives: ['stabilize', 'recover'] },
    plan: { variant: 'incident_command' },
    members: baseMembers
  });
  assert(policy.incidentRoles);
  assert(policy.sitrepIntervalMinutes === 15);
  assert(policy.operationalObjectives);
  assert(policy.spanOfControl);
  assert(policy.divisions);
  assert(policy.icsStructure);
  assert(policy.handoverProtocol);
  assert(policy.closureProtocol);

  // Multiteam
  policy = buildOperationalPolicy({
    mission: { subTeams: [{ teamId: 't1', variant: 'pipeline', members: ['m1'] }, { teamId: 't2', variant: 'expert_committee', members: ['m2', 'm3'] }], systemObjectives: ['deliver'], globalBudget: { tokens: 1000 } },
    plan: { variant: 'multiteam' },
    members: baseMembers
  });
  assert(policy.multiteamSystem);
  assert(policy.systemObjectives);
  assert(policy.integrationCouncil);
  assert(policy.interTeamContracts);
  assert(policy.boundarySpanners);
  assert(policy.budget);
  assert(policy.systemicConflictDetection);

  // Adaptive
  policy = buildOperationalPolicy({
    mission: { requiredCapabilities: ['security', 'backend', 'frontend', 'devops', 'ml'], reconfigurationCost: 100, hysteresisThreshold: 0.2 },
    plan: { variant: 'adaptive' },
    members: baseMembers
  });
  assert(policy.capabilityGaps);
  assert(policy.staffingActions);
  assert(policy.continuousStaffing);
  assert(policy.morphogenesisTransition);
  assert(policy.memoryTransfer);
  assert(policy.thrashingPrevention);

  // Relay Team
  policy = buildOperationalPolicy({
    mission: { handoffVersion: 1, handoffSequence: 1, handoffSummary: 'context', handoffState: {}, artifactRefs: ['a1'], evidenceRefs: ['e1'] },
    plan: { variant: 'relay_team' },
    members: [{ memberId: 'm1' }, { memberId: 'm2' }]
  });
  assert(policy.relayHandoff);
  assert(policy.relayHandoff.digest);
  assert(policy.relayHandoff.receiverValidationRequired);
  assert(policy.relayHandoff.rollbackOwner);
  assert(policy.relayHandoff.ownershipLeaseRequired);
  assert(policy.relayHandoff.controlledSummary);
  assert(policy.relayHandoff.stateOwnership);
  assert(policy.relayHandoff.rollbackCapability);

  console.log('All A-Team variant policy tests passed!');
}

run();
