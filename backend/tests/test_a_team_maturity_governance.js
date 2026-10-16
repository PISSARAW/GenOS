'use strict';

const assert = require('node:assert/strict');
const { VARIANTS } = require('../src/services/aTeam/variants/variantRegistry');
const catalog = require('../src/services/morphogenesis/registry/variantCatalog');
const { prepareDispatchPolicy } = require('../src/services/aTeam/dispatchPolicyService');
const { selectTopology } = require('../src/services/ontogenesis/topologySelector');
const { createMockMembers, runVariantTest } = require('./fixtures/ateamVariantTestHelpers');

const PROMOTED = ['matrix_team', 'incident_command', 'adaptive'];

function dispatchMembers() {
  return [
    { memberId: 'api', subSystem: 'api', label: 'api', role: 'backend', capabilities: ['api'] },
    { memberId: 'web', subSystem: 'web', label: 'web', role: 'frontend', capabilities: ['web'] },
    { memberId: 'sec', subSystem: 'sec', label: 'sec', role: 'security', capabilities: ['sec'] },
    { memberId: 'ops', subSystem: 'ops', label: 'ops', role: 'operations', capabilities: ['ops'] }
  ];
}

function testRegistry() {
  assert.equal(Object.keys(VARIANTS).length, 11);
  for (const [variantId, definition] of Object.entries(VARIANTS)) {
    assert.equal(definition.maturity, 'implemented', variantId);
  }
  assert.deepEqual(VARIANTS.matrix_team.fullPotential, [
    'authority_matrix_by_decision_type', 'conflicting_owners', 'escalation_paths',
    'raci_dimensions', 'transactional_disagreement_resolution'
  ]);
  assert.deepEqual(VARIANTS.incident_command.fullPotential, [
    'mandatory_ics_roles', 'sitrep_cadence', 'incident_timeline',
    'objectives_per_operational_period', 'span_of_control',
    'structured_handover', 'structured_closure'
  ]);
  assert.deepEqual(VARIANTS.adaptive.fullPotential, [
    'continuous_staffing_by_capability_gap', 'real_recruitment',
    'transactional_morphogenesis_transition', 'memory_transfer',
    'reconfiguration_cost', 'hysteresis_anti_thrashing'
  ]);
}

function testCatalog() {
  const entries = catalog.topologyVariants('a_team');
  assert.equal(entries.length, Object.keys(VARIANTS).length);
  for (const entry of entries) {
    assert.equal(entry.maturity, VARIANTS[entry.variantId].maturity, entry.variantId);
  }
  const byId = new Map(entries.map((entry) => [entry.variantId, entry]));
  assert.ok(byId.get('matrix_team').parameters.fullPotential.includes('authority_matrix_by_decision_type'));
  assert.ok(byId.get('incident_command').parameters.fullPotential.includes('span_of_control'));
  assert.ok(byId.get('adaptive').parameters.fullPotential.includes('hysteresis_anti_thrashing'));
  assert.ok(catalog.topologyVariants('trinity').length > 0);
  assert.ok(catalog.topologyVariants('biocenose').every((entry) => Boolean(entry.maturity)));
}

function testDispatch() {
  const members = dispatchMembers();
  const matrix = prepareDispatchPolicy({ mission: { variant: 'matrix_team',
    decisionAuthorities: [
      { decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd' },
      { decisionType: 'deploy', functionalOwnerId: 'fn', productOwnerId: 'pd' }
    ] }, members });
  assert.deepEqual(matrix.policy.authority_matrix_by_decision_type.decisionTypes, ['release', 'deploy']);
  assert.deepEqual(Object.keys(matrix.policy.authorityMatrix.byDecisionType), ['release', 'deploy']);
  assert.equal(matrix.policy.transactional_disagreement_resolution.bothApprovalsRequired, true);
  assert.match(matrix.members[0].mission, /release, deploy/);
  const incident = prepareDispatchPolicy({ mission: { variant: 'incident_command',
    incidentRoles: { commander: 'api', operations: 'ops', planning: 'web', logistics: 'sec' },
    sitrepIntervalMinutes: 15, operationalObjectives: ['restore'] }, members });
  assert.equal(incident.policy.mandatory_ics_roles.allAssigned, true);
  assert.equal(incident.policy.sitrep_cadence.intervalMinutes, 15);
  assert.equal(incident.policy.span_of_control.enforced, true);
  assert.equal(incident.policy.structured_handover.required, true);
  assert.equal(incident.policy.structured_closure.required, true);
  const adaptive = prepareDispatchPolicy({ mission: { variant: 'adaptive', uncertainty: 0.8,
    requiredCapabilities: ['security'], stableSince: '2026-10-16T10:00:00Z' }, members: members.slice(0, 2) });
  assert.deepEqual(adaptive.policy.continuous_staffing_by_capability_gap.gaps, ['security']);
  assert.equal(adaptive.policy.real_recruitment.recruitmentAction.length, 1);
  assert.equal(adaptive.policy.hysteresis_anti_thrashing.stableSince, '2026-10-16T10:00:00Z');
}

function testRouting() {
  for (const variant of PROMOTED) {
    const selected = selectTopology({ taskKind: 'implement', allowedTopologies: ['a_team'],
      availableCapabilities: ['execute', 'coordinate'], variant });
    assert.equal(selected.topology, 'a_team');
    assert.equal(selected.variant, variant);
  }
}

async function testMatrixDisagreement() {
  const members = createMockMembers([
    { memberId: 'fn', domain: 'fn', role: 'backend', capabilities: ['api'] },
    { memberId: 'pd', domain: 'pd', role: 'frontend', capabilities: ['web'] },
    { memberId: 's', domain: 'sec', role: 'security', capabilities: ['sec'] }
  ]);
  const mission = {
    variant: 'matrix_team',
    decisionAuthorities: [{ decisionType: 'release', functionalOwnerId: 'fn', productOwnerId: 'pd', sponsorId: 'sponsor-1' }],
    decisions: [{ decisionId: 'd1', type: 'release', revision: 0,
      functionalApproval: true, functionalApproverId: 'fn', productApproval: false }]
  };
  const result = await runVariantTest('matrix_team', mission, { members, boundaries: { interfaces: [] } });
  const recorded = result.decisions.find((decision) => decision.type === 'matrix_decision');
  assert.equal(recorded.data.status, 'DISAGREEMENT');
  assert.equal(recorded.data.resolution, 'sponsor-1');
}

async function testAdaptiveStability() {
  const members = createMockMembers([
    { memberId: 'a', domain: 'api', role: 'backend', capabilities: ['api'] },
    { memberId: 'b', domain: 'web', role: 'frontend', capabilities: ['web'] }
  ]);
  const mission = {
    variant: 'adaptive', uncertainty: 0.8, requiredCapabilities: ['security'],
    availableBudget: 100, stableSince: new Date().toISOString(), minStabilityPeriod: 3600000,
    staffingProposals: [{ capability: 'security', capabilityGap: true,
      expectedCoverageGain: 0.9, verified: true, estimatedCost: 10 }]
  };
  await assert.rejects(runVariantTest('adaptive', mission, { members, boundaries: { interfaces: [] } }),
    (error) => error.code === 'ATEAM_STAFFING_REJECTED');
}

async function runTests() {
  testRegistry();
  testCatalog();
  testDispatch();
  testRouting();
  await testMatrixDisagreement();
  await testAdaptiveStability();
  console.log('A-Team maturity governance (matrix/incident/adaptive): pass');
}

runTests().catch((error) => { console.error(error); process.exitCode = 1; });
