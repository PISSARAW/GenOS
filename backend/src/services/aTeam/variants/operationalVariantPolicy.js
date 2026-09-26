'use strict';

const teamPolicies = require('./teamVariantPolicies');
const { pipelinePolicy } = require('./stageVariantPolicy');
const { projectDagPolicy } = require('./projectDagPolicy');
const { multiteamPolicy } = require('./multiteamVariantPolicy');
const { expertCommitteeFullPotential } = require('./expertCommitteePolicy');
const { crossFunctionalPodFullPotential } = require('./crossFunctionalPodPolicy');
const { boundarySpannerFullPotential } = require('./boundarySpannerPolicy');
const { matrixTeamFullPotential } = require('./matrixTeamPolicy');
const { tigerTeamFullPotential } = require('./tigerTeamPolicy');
const { incidentCommandFullPotential } = require('./incidentCommandPolicy');
const { adaptiveTeamFullPotential } = require('./adaptiveTeamPolicy');
const { relayTeamFullPotential } = require('./relayTeamPolicy');

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

function buildFullPotential(input = {}) {
  const { mission = {}, plan = {}, members = [], boundaries = { interfaces: [] } } = input;
  const fullPotentials = {
    expert_committee: () => expertCommitteeFullPotential(mission, members),
    boundary_spanner: () => boundarySpannerFullPotential(mission, boundaries, members),
    matrix_team: () => matrixTeamFullPotential(mission),
    tiger_team: () => tigerTeamFullPotential(mission),
    incident_command: () => incidentCommandFullPotential(mission, members),
    adaptive: () => adaptiveTeamFullPotential(mission, members),
    relay_team: () => relayTeamFullPotential(mission, members),
    cross_functional_pod: () => crossFunctionalPodFullPotential(mission, members),
    pipeline: () => ({ /* déjà implémenté dans stageVariantPolicy */ fullPotential: ['input_output_schemas_per_stage', 'contractual_validation', 'local_retry', 'backpressure', 'streaming', 'stage_cache', 'resume_from_last_valid'] }),
    project_dag: () => ({ /* déjà implémenté dans projectDagPolicy */ fullPotential: ['critical_path_scheduler', 'resource_scheduling', 'typed_fan_in_fan_out', 'conditional_joins', 'incremental_invalidation', 'minimal_recalculation'] }),
    multiteam: () => ({ /* déjà implémenté dans multiteamVariantPolicy */ fullPotential: ['recursive_team_of_teams', 'local_and_system_objectives', 'integration_council', 'inter_team_contracts', 'boundary_spanners', 'global_local_budget', 'systemic_conflict_detection'] })
  };
  try {
    return fullPotentials[plan.variant]?.() || {};
  } catch (error) {
    if (error.code) throw error;
    throw Object.assign(error, { code: 'ATEAM_VARIANT_FULL_POTENTIAL_INVALID' });
  }
}

module.exports = { buildOperationalPolicy, buildFullPotential };
