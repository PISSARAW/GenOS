'use strict';

const teamPolicies = require('./teamVariantPolicies');
const { pipelinePolicy } = require('./stageVariantPolicy');
const { projectDagPolicy } = require('./projectDagPolicy');
const { multiteamPolicy } = require('./multiteamVariantPolicy');

function buildOperationalPolicy(input = {}) {
  const { mission = {}, plan = {}, members = [], boundaries = { interfaces: [] } } = input;
  const policies = {
    expert_committee: () => teamPolicies.expertCommittee(mission, members),
    boundary_spanner: () => teamPolicies.interfaceContracts(mission, boundaries, members),
    matrix_team: () => teamPolicies.matrixDecisions(mission),
    tiger_team: () => teamPolicies.tigerMandate(mission),
    incident_command: () => teamPolicies.incidentStructure(mission, members),
    adaptive: () => teamPolicies.staffingPlan(mission, members),
    relay_team: () => teamPolicies.relayPackage(mission, members),
    cross_functional_pod: () => teamPolicies.podOwnership(mission, members),
    pipeline: () => pipelinePolicy(mission, members),
    project_dag: () => projectDagPolicy(mission, members),
    multiteam: () => multiteamPolicy(mission, members)
  };
  try {
    return policies[plan.variant]?.() || {};
  } catch (error) {
    if (error.code) throw error;
    throw Object.assign(error, { code: 'ATEAM_VARIANT_POLICY_INVALID' });
  }
}

module.exports = { buildOperationalPolicy };
